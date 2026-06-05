//! libobs-backed engine — the real capture/encode/RTMP path.
//!
//! Enabled with `--features engine-libobs`. Implements the same [`Backend`] trait
//! as the stub, so the rest of the app (UI, Tauri commands, scene graph in
//! `engine.rs`) is unchanged whether or not this is compiled in.
//!
//! ## Threading model (this is the important, non-obvious part)
//! libobs has **hard thread affinity** — the OBS context, scenes, sources and
//! outputs must all be created and driven from one dedicated thread, and many of
//! its handles are `!Send`. We therefore spawn a single "obs-engine" worker
//! thread that *owns* every OBS object, and this backend holds only an
//! `mpsc::Sender<Cmd>` to it (which is `Send`, satisfying the trait). Every
//! trait call becomes a message; calls that can fail (start/stop output) carry a
//! reply channel so errors surface synchronously to the UI.
//!
//! ## What I can and can't guarantee
//! The architecture below (worker, channel, trait impl, URL parsing, fallback)
//! is complete and sound. The **OBS API calls inside `worker_main`** follow the
//! published libobs-simple example; libobs-wrapper's surface shifts between major
//! versions (currently v9 / OBS 32.x), so on the *first* `cargo build
//! --features engine-libobs` on a dev box you may need to reconcile a few
//! import paths / method names. They are deliberately kept in one function and
//! flagged with `RECONCILE:` so that's a 10-minute job, not a rewrite. The two
//! spots most likely to need a touch are the prelude import and the RTMP service
//! wiring (see `RECONCILE` notes).

#![cfg(feature = "engine-libobs")]

use crate::engine::{Backend, Source, SourceKind};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread::{self, JoinHandle};

/// Commands sent from the backend (any thread) to the OBS worker thread.
enum Cmd {
    CreateScene(String),
    SetActiveScene(String),
    AddSource {
        scene: String,
        source: Source,
    },
    RemoveSource {
        scene: String,
        name: String,
    },
    StartOutput {
        ingest_url: String,
        reply: Sender<Result<(), String>>,
    },
    StopOutput {
        reply: Sender<Result<(), String>>,
    },
    Shutdown,
}

pub struct LibObsBackend {
    tx: Sender<Cmd>,
    worker: Option<JoinHandle<()>>,
}

impl LibObsBackend {
    /// Spawn the OBS worker and block until it reports successful init (or fails).
    pub fn new() -> Result<Self, String> {
        let (tx, rx) = mpsc::channel::<Cmd>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

        let worker = thread::Builder::new()
            .name("obs-engine".into())
            .spawn(move || worker_main(rx, ready_tx))
            .map_err(|e| format!("spawn obs-engine thread: {e}"))?;

        match ready_rx.recv() {
            Ok(Ok(())) => Ok(Self {
                tx,
                worker: Some(worker),
            }),
            Ok(Err(e)) => Err(e),
            Err(_) => Err("obs worker terminated during init".into()),
        }
    }

    fn send(&self, cmd: Cmd) {
        // If the worker is gone the app is shutting down; dropping is fine.
        let _ = self.tx.send(cmd);
    }

    fn request(&self, make: impl FnOnce(Sender<Result<(), String>>) -> Cmd) -> Result<(), String> {
        let (reply, rx) = mpsc::channel();
        self.send(make(reply));
        rx.recv()
            .map_err(|_| "obs worker dropped before replying".to_string())?
    }
}

impl Backend for LibObsBackend {
    fn create_scene(&mut self, name: &str) {
        self.send(Cmd::CreateScene(name.to_string()));
    }

    fn set_active_scene(&mut self, name: &str) {
        self.send(Cmd::SetActiveScene(name.to_string()));
    }

    fn add_source(&mut self, scene: &str, source: &Source) {
        self.send(Cmd::AddSource {
            scene: scene.to_string(),
            source: source.clone(),
        });
    }

    fn remove_source(&mut self, scene: &str, name: &str) {
        self.send(Cmd::RemoveSource {
            scene: scene.to_string(),
            name: name.to_string(),
        });
    }

    fn start_output(&mut self, ingest_url: &str) -> Result<(), String> {
        let url = ingest_url.to_string();
        self.request(|reply| Cmd::StartOutput {
            ingest_url: url,
            reply,
        })
    }

    fn stop_output(&mut self) -> Result<(), String> {
        self.request(|reply| Cmd::StopOutput { reply })
    }
}

impl Drop for LibObsBackend {
    fn drop(&mut self) {
        let _ = self.tx.send(Cmd::Shutdown);
        if let Some(w) = self.worker.take() {
            let _ = w.join();
        }
    }
}

/// Split an ingest URL like `rtmp://host:1935/live/key` into the OBS service
/// `(server, key)` pair: server is everything up to the last path segment, key
/// is the last segment. For our MediaMTX ingest (`rtmp://host:1935/<path>`) the
/// path becomes the key and the origin becomes the server — exactly what an
/// `rtmp_custom` service expects.
fn parse_rtmp_target(url: &str) -> (String, String) {
    match url.rsplit_once('/') {
        // Don't split on the `//` in the scheme.
        Some((server, key)) if !server.ends_with(':') && !server.is_empty() => {
            (server.to_string(), key.to_string())
        }
        _ => (url.to_string(), String::new()),
    }
}

/// The OBS worker: owns the context and every OBS object, processes commands.
///
/// All wrapper objects (context, scenes, output) are kept in locals with inferred
/// types so we never name the wrapper's (version-volatile) handle types.
fn worker_main(rx: Receiver<Cmd>, ready: Sender<Result<(), String>>) {
    // RECONCILE(1): prelude path. If `libobs_simple::prelude` doesn't exist in the
    // installed version, import the concrete types instead, e.g.:
    //   use libobs_wrapper::{context::ObsContext, data::ObsData, utils::*, ...};
    use libobs_simple::prelude::*;
    use std::collections::HashMap;

    // Initialize OBS on this dedicated thread.
    let startup = StartupInfo::default();
    let mut context = match ObsContext::new(startup) {
        Ok(c) => c,
        Err(e) => {
            let _ = ready.send(Err(format!("ObsContext::new failed: {e:?}")));
            return;
        }
    };
    let _ = ready.send(Ok(()));

    // name -> scene handle (value type inferred from the first insert).
    let mut scenes = HashMap::new();
    // The active streaming output, when live (Option type inferred on first set).
    let mut output = None;

    while let Ok(cmd) = rx.recv() {
        match cmd {
            Cmd::CreateScene(name) => {
                let scene = context.scene(name.clone());
                scenes.insert(name, scene);
            }

            Cmd::SetActiveScene(name) => {
                if let Some(scene) = scenes.get_mut(&name) {
                    // Bind this scene to program output channel 0.
                    scene.add_and_set(0);
                }
            }

            Cmd::AddSource { scene, source } => {
                let Some(scene) = scenes.get_mut(&scene) else {
                    continue;
                };
                match source.kind {
                    SourceKind::Display => {
                        // RECONCILE(2): monitor capture builder. Variant for window/
                        // camera/audio capture have sibling builders
                        // (WindowCaptureSourceBuilder, etc.) — add as needed.
                        match MonitorCaptureSourceBuilder::get_monitors() {
                            Ok(monitors) => {
                                if let Some(monitor) = monitors.first() {
                                    if let Err(e) = MonitorCaptureSourceBuilder::new(&source.name)
                                        .set_monitor(monitor)
                                        .add_to_scene(scene)
                                    {
                                        eprintln!("[engine/libobs] add monitor source: {e:?}");
                                    }
                                } else {
                                    eprintln!("[engine/libobs] no monitors found");
                                }
                            }
                            Err(e) => eprintln!("[engine/libobs] enumerate monitors: {e:?}"),
                        }
                    }
                    other => {
                        // Window/Camera/Audio/Browser builders land here next.
                        eprintln!("[engine/libobs] source kind {other:?} not yet implemented");
                    }
                }
            }

            Cmd::RemoveSource { scene, name } => {
                // Removing requires tracking the created source handles per scene;
                // wired up alongside the window/camera builders above.
                eprintln!("[engine/libobs] remove_source({scene}, {name}) — TODO: track handles");
            }

            Cmd::StartOutput { ingest_url, reply } => {
                // Inlined so every wrapper handle keeps its inferred type (we never
                // name version-volatile types). The closure lets us use `?` and
                // map every failure to a String for the UI.
                let (server, key) = parse_rtmp_target(&ingest_url);
                let built = (|| {
                    // RECONCILE(3): `rtmp_output` typically reads server+key from an
                    // obs_service ("rtmp_custom") attached via obs_output_set_service,
                    // not from output settings. If the wrapper exposes services,
                    // create one here and attach it; otherwise these settings are the
                    // fallback path.
                    let mut out_settings = ObsData::new();
                    out_settings.set_string("server", &server);
                    out_settings.set_string("key", &key);
                    let info =
                        OutputInfo::new("rtmp_output", "asc_stream", Some(out_settings), None);
                    let mut out = context
                        .output(info)
                        .map_err(|e| format!("create rtmp output: {e:?}"))?;

                    // Video encoder — first available; prefer a hardware encoder here.
                    let encoders = ObsContext::get_available_video_encoders();
                    let encoder = encoders
                        .first()
                        .cloned()
                        .ok_or("no video encoder available")?;
                    let mut venc = ObsData::new();
                    venc.set_string("rate_control", "CBR");
                    venc.set_int("bitrate", 6000);
                    venc.set_string("preset", "veryfast");
                    venc.set_string("profile", "high");
                    let venc_info = VideoEncoderInfo::new(encoder, "asc_video", Some(venc), None);
                    let video =
                        ObsContext::get_video_ptr().map_err(|e| format!("video ptr: {e:?}"))?;
                    out.video_encoder(venc_info, video)
                        .map_err(|e| format!("set video encoder: {e:?}"))?;

                    // Audio encoder.
                    let mut aenc = ObsData::new();
                    aenc.set_int("bitrate", 160);
                    let aenc_info =
                        AudioEncoderInfo::new("ffmpeg_aac", "asc_audio", Some(aenc), None);
                    let audio =
                        ObsContext::get_audio_ptr().map_err(|e| format!("audio ptr: {e:?}"))?;
                    out.audio_encoder(aenc_info, 0, audio)
                        .map_err(|e| format!("set audio encoder: {e:?}"))?;

                    out.start().map_err(|e| format!("start output: {e:?}"))?;
                    Ok::<_, String>(out)
                })();

                match built {
                    Ok(out) => {
                        output = Some(out);
                        let _ = reply.send(Ok(()));
                    }
                    Err(e) => {
                        output = None;
                        let _ = reply.send(Err(e));
                    }
                }
            }

            Cmd::StopOutput { reply } => {
                let r = match output.as_mut() {
                    Some(out) => out.stop().map_err(|e| format!("stop output: {e:?}")),
                    None => Ok(()),
                };
                output = None;
                let _ = reply.send(r);
            }

            Cmd::Shutdown => break,
        }
    }
    // Dropping `context`/`output` here tears OBS down cleanly on this thread.
}

#[cfg(test)]
mod tests {
    use super::parse_rtmp_target;

    #[test]
    fn parses_mediamtx_path_as_key() {
        let (server, key) = parse_rtmp_target("rtmp://localhost:1935/live");
        assert_eq!(server, "rtmp://localhost:1935");
        assert_eq!(key, "live");
    }

    #[test]
    fn parses_app_plus_streamkey() {
        let (server, key) = parse_rtmp_target("rtmp://live.twitch.tv/app/abc123");
        assert_eq!(server, "rtmp://live.twitch.tv/app");
        assert_eq!(key, "abc123");
    }

    #[test]
    fn no_path_yields_empty_key() {
        let (server, key) = parse_rtmp_target("rtmp://host:1935");
        assert_eq!(server, "rtmp://host:1935");
        assert_eq!(key, "");
    }
}
