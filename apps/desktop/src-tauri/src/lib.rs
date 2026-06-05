//! ApexStreamCentre Studio — Tauri application core.

mod commands;
mod engine;
#[cfg(feature = "engine-libobs")]
mod libobs_backend;

use engine::Engine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Engine::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_scenes,
            commands::add_scene,
            commands::set_active_scene,
            commands::add_source,
            commands::remove_source,
            commands::start_stream,
            commands::stop_stream,
            commands::get_stream_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ApexStreamCentre");
}
