mod audio;
mod config;
#[cfg(debug_assertions)]
mod dev;
mod hotkey;
mod session;
mod shell;
mod tray;
mod windows;

use tauri::{Manager, RunEvent};

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::open_settings(app);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            tray::build(app.handle())?;
            let settings_path = app.path().app_config_dir()?.join(config::FILE_NAME);
            shell::start(config::load(&settings_path));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the Tauri application failed to build");

    app.run(|_app, event| {
        if let RunEvent::ExitRequested {
            api, code: None, ..
        } = event
        {
            api.prevent_exit();
        }
    });
}
