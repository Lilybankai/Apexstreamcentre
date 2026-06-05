# Native engine (libobs) — build & verify

The desktop studio can drive the **real OBS engine** (`libobs`) for capture,
compositing, encoding and RTMP output. This is gated behind the `engine-libobs`
Cargo feature so the default build (and CI) stays lightweight and native-free.

- Default build → `StubBackend` (in-memory scene graph, no capture).
- `--features engine-libobs` → `LibObsBackend` (this guide).

Implementation: `apps/desktop/src-tauri/src/libobs_backend.rs`. It maps the
`Backend` trait (`engine.rs`) onto the [`libobs-rs`](https://github.com/libobs-rs/libobs-rs)
crates (`libobs-wrapper` v9 / `libobs-simple` v8, tracking OBS 32.x).

> **Why this needs a dev box:** libobs requires the OBS runtime, a GPU/display
> and platform capture APIs — none of which exist in CI or a headless Linux
> container. The architecture (worker thread, command channel, trait impl, URL
> parsing, stub fallback) is complete; the OBS *call sites* follow the published
> libobs example and may need minor reconciliation against the installed wrapper
> version on first compile. They're all in `worker_main`, tagged `RECONCILE`.

## Architecture (why a worker thread)

libobs has **hard thread affinity** and many `!Send` handles. So:

```
UI ──Tauri cmd──▶ Engine (Mutex) ──Backend trait──▶ LibObsBackend
                                                        │ mpsc::Sender<Cmd>
                                                        ▼
                                          "obs-engine" worker thread
                                          owns ObsContext + scenes + output
```

The backend holds only a `Sender` (which *is* `Send`), so it satisfies the trait
while every OBS object lives and dies on the one worker thread. Fallible calls
(`start_output`/`stop_output`) carry a reply channel so errors reach the UI.

## Prerequisites (dev box)

1. **Rust** stable + the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
   for your OS (WebView2 on Windows; webkitgtk on Linux; Xcode CLT on macOS).
2. **Node 20+** and **pnpm 10+** (`corepack enable`).
3. The **OBS runtime**. `libobs-wrapper`'s bootstrapper can download/install it on
   first run; alternatively install OBS Studio 32.x so its libraries are present.
4. A GPU/display (this captures a real monitor).

## Build & run

```bash
pnpm install
pnpm --filter @apex/desktop build           # front-end (produces dist/)

# Run the studio with the real engine:
cd apps/desktop
pnpm tauri dev --features engine-libobs
# or a release build:
pnpm tauri build --features engine-libobs
```

If libobs fails to initialise, the app logs `libobs init failed (...) falling
back to stub backend` and still launches — so a bad environment never bricks the
UI.

## First-compile reconcile checklist

The OBS call sites target the documented libobs-simple API. If the installed
version differs, the compiler points you straight at these (all in
`libobs_backend.rs::worker_main`, tagged `RECONCILE(n)`):

- **RECONCILE(1) — imports.** If `libobs_simple::prelude` isn't present, import
  concrete types from `libobs_wrapper` (`context::ObsContext`, `data::ObsData`,
  `utils::{StartupInfo, OutputInfo, VideoEncoderInfo, AudioEncoderInfo}`,
  `sources::MonitorCaptureSourceBuilder`, `encoders::ObsVideoEncoderType`).
- **RECONCILE(2) — sources.** `MonitorCaptureSourceBuilder` for Display is wired;
  add `WindowCaptureSourceBuilder` / camera / audio / browser builders for the
  other `SourceKind`s (and track their handles to support `remove_source`).
- **RECONCILE(3) — RTMP service.** `rtmp_output` usually reads `server`+`key`
  from an `obs_service` (`rtmp_custom`) attached via `obs_output_set_service`,
  not from output settings. If the wrapper exposes services, create one with the
  parsed `(server, key)` and attach it; the settings path is the fallback.

`parse_rtmp_target` (unit-tested in the module) already splits our ingest URL
into the `(server, key)` an `rtmp_custom` service expects.

## End-to-end verification (the real test)

1. Start the local stack: `pnpm dev:stack` (MediaMTX on `:1935`).
2. Launch `pnpm tauri dev --features engine-libobs`.
3. In the studio, confirm the **Display Capture** source previews your monitor.
4. Set the ingest field to `rtmp://localhost:1935/live` and click **Go Live**.
5. Confirm MediaMTX receives the stream (its logs / API at `:9997`), and — with
   `infra/mediamtx/destinations/live.txt` populated — that it fans out to your
   test destination(s).
6. Click **End Stream**; confirm the output stops cleanly.

When all six pass, flip the desktop release pipeline to build with
`--features engine-libobs` and update `docs/LICENSING.md`'s release checklist
(the shipped binary now links libobs → GPLv2 source-offer applies).
