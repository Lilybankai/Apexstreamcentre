//! Engine core: the scene graph + the streaming output, behind a `Backend` seam.
//!
//! The UI talks to this through Tauri commands (see `commands.rs`). The scene
//! graph (scenes, sources, active scene) lives here in plain Rust so it is
//! identical regardless of backend. Capture/compositing/encoding/output are
//! delegated to a [`Backend`]:
//!
//!   * [`StubBackend`] — default. Tracks state only; performs no real capture.
//!     Lets the entire app build and the UI be developed on any OS without the
//!     OBS runtime.
//!   * `LibObsBackend` (feature `engine-libobs`) — drives the real OBS engine via
//!     the `libobs`/`libobs-wrapper` crates: `obs_startup`, create scene + sources,
//!     configure an x264/NVENC encoder, and an RTMP output to our ingest. The
//!     trait below maps 1:1 onto those libobs calls, so wiring it up is mechanical.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    Display,
    Window,
    Camera,
    Audio,
    Browser,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Source {
    pub name: String,
    pub kind: SourceKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Scene {
    pub name: String,
    pub sources: Vec<Source>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SceneState {
    pub active: String,
    pub scenes: Vec<Scene>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StreamStatus {
    pub live: bool,
    #[serde(rename = "ingestUrl", skip_serializing_if = "Option::is_none")]
    pub ingest_url: Option<String>,
    #[serde(rename = "startedAt", skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
}

/// Backend abstraction over the native streaming engine.
pub trait Backend: Send {
    fn create_scene(&mut self, name: &str);
    fn set_active_scene(&mut self, name: &str);
    fn add_source(&mut self, scene: &str, source: &Source);
    fn remove_source(&mut self, scene: &str, name: &str);
    /// Begin encoding the active scene and pushing RTMP to `ingest_url`.
    fn start_output(&mut self, ingest_url: &str) -> Result<(), String>;
    fn stop_output(&mut self) -> Result<(), String>;
}

/// Default no-op backend: tracks nothing native, just logs intent.
pub struct StubBackend;

impl Backend for StubBackend {
    fn create_scene(&mut self, name: &str) {
        log(&format!("create_scene({name})"));
    }
    fn set_active_scene(&mut self, name: &str) {
        log(&format!("set_active_scene({name})"));
    }
    fn add_source(&mut self, scene: &str, source: &Source) {
        log(&format!(
            "add_source({scene}, {:?} {})",
            source.kind, source.name
        ));
    }
    fn remove_source(&mut self, scene: &str, name: &str) {
        log(&format!("remove_source({scene}, {name})"));
    }
    fn start_output(&mut self, ingest_url: &str) -> Result<(), String> {
        log(&format!("start_output -> {ingest_url}"));
        Ok(())
    }
    fn stop_output(&mut self) -> Result<(), String> {
        log("stop_output");
        Ok(())
    }
}

fn log(msg: &str) {
    println!("[engine/stub] {msg}");
}

/// The engine: scene graph + stream status + the active backend.
pub struct Engine {
    inner: Mutex<EngineInner>,
}

struct EngineInner {
    state: SceneState,
    stream: StreamStatus,
    backend: Box<dyn Backend>,
}

impl Engine {
    pub fn new() -> Self {
        let mut backend: Box<dyn Backend> = select_backend();
        // Seed a sensible default project.
        backend.create_scene("Main Scene");
        backend.create_scene("Starting Soon");
        backend.set_active_scene("Main Scene");
        let display = Source {
            name: "Display Capture".into(),
            kind: SourceKind::Display,
            url: None,
        };
        backend.add_source("Main Scene", &display);

        Engine {
            inner: Mutex::new(EngineInner {
                state: SceneState {
                    active: "Main Scene".into(),
                    scenes: vec![
                        Scene {
                            name: "Main Scene".into(),
                            sources: vec![display],
                        },
                        Scene {
                            name: "Starting Soon".into(),
                            sources: vec![],
                        },
                    ],
                },
                stream: StreamStatus {
                    live: false,
                    ingest_url: None,
                    started_at: None,
                },
                backend,
            }),
        }
    }

    pub fn scenes(&self) -> SceneState {
        self.inner.lock().unwrap().state.clone()
    }

    pub fn stream_status(&self) -> StreamStatus {
        self.inner.lock().unwrap().stream.clone()
    }

    pub fn add_scene(&self, name: &str) -> SceneState {
        let mut g = self.inner.lock().unwrap();
        if !g.state.scenes.iter().any(|s| s.name == name) {
            g.backend.create_scene(name);
            g.state.scenes.push(Scene {
                name: name.into(),
                sources: vec![],
            });
        }
        g.state.clone()
    }

    pub fn set_active_scene(&self, name: &str) -> SceneState {
        let mut g = self.inner.lock().unwrap();
        if g.state.scenes.iter().any(|s| s.name == name) {
            g.backend.set_active_scene(name);
            g.state.active = name.into();
        }
        g.state.clone()
    }

    pub fn add_source(&self, scene: &str, kind: SourceKind, name: &str) -> SceneState {
        let mut g = self.inner.lock().unwrap();
        let source = Source {
            name: name.into(),
            kind,
            url: None,
        };
        g.backend.add_source(scene, &source);
        if let Some(s) = g.state.scenes.iter_mut().find(|s| s.name == scene) {
            s.sources.push(source);
        }
        g.state.clone()
    }

    pub fn remove_source(&self, scene: &str, name: &str) -> SceneState {
        let mut g = self.inner.lock().unwrap();
        g.backend.remove_source(scene, name);
        if let Some(s) = g.state.scenes.iter_mut().find(|s| s.name == scene) {
            s.sources.retain(|src| src.name != name);
        }
        g.state.clone()
    }

    pub fn start_stream(&self, ingest_url: &str) -> Result<StreamStatus, String> {
        let mut g = self.inner.lock().unwrap();
        g.backend.start_output(ingest_url)?;
        g.stream = StreamStatus {
            live: true,
            ingest_url: Some(ingest_url.into()),
            started_at: Some(now_ms()),
        };
        Ok(g.stream.clone())
    }

    pub fn stop_stream(&self) -> Result<StreamStatus, String> {
        let mut g = self.inner.lock().unwrap();
        g.backend.stop_output()?;
        g.stream = StreamStatus {
            live: false,
            ingest_url: None,
            started_at: None,
        };
        Ok(g.stream.clone())
    }
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

fn select_backend() -> Box<dyn Backend> {
    #[cfg(feature = "engine-libobs")]
    {
        // Drive the real OBS engine. If init fails (no runtime, no GPU, etc.)
        // fall back to the stub so the app still launches and the UI works.
        match crate::libobs_backend::LibObsBackend::new() {
            Ok(b) => return Box::new(b),
            Err(e) => eprintln!("[engine] libobs init failed ({e}); falling back to stub backend"),
        }
    }
    Box::new(StubBackend)
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
