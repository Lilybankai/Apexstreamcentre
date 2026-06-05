//! Tauri commands — the IPC surface the studio UI calls (see apps/desktop/src/engine.ts).

use crate::engine::{Engine, SceneState, SourceKind, StreamStatus};
use tauri::State;

#[tauri::command]
pub fn get_scenes(engine: State<Engine>) -> SceneState {
    engine.scenes()
}

#[tauri::command]
pub fn add_scene(engine: State<Engine>, name: String) -> SceneState {
    engine.add_scene(&name)
}

#[tauri::command]
pub fn set_active_scene(engine: State<Engine>, name: String) -> SceneState {
    engine.set_active_scene(&name)
}

#[tauri::command]
pub fn add_source(
    engine: State<Engine>,
    scene: String,
    kind: SourceKind,
    name: String,
) -> SceneState {
    engine.add_source(&scene, kind, &name)
}

#[tauri::command]
pub fn remove_source(engine: State<Engine>, scene: String, name: String) -> SceneState {
    engine.remove_source(&scene, &name)
}

#[tauri::command]
pub fn start_stream(engine: State<Engine>, ingest_url: String) -> Result<StreamStatus, String> {
    engine.start_stream(&ingest_url)
}

#[tauri::command]
pub fn stop_stream(engine: State<Engine>) -> Result<StreamStatus, String> {
    engine.stop_stream()
}

#[tauri::command]
pub fn get_stream_status(engine: State<Engine>) -> StreamStatus {
    engine.stream_status()
}
