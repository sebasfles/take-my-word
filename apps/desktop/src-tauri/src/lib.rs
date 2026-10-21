mod api;
mod audio;
mod clipboard;
mod commands;
mod config;
#[cfg(debug_assertions)]
mod dev;
mod dictation;
mod foreground;
mod hotkey;
mod locale;
mod overlay;
mod paste;
mod session;
mod shell;
mod tray;
mod windows;

use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_autostart::ManagerExt;

use crate::shell::Shell;

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            on_second_launch(app, &args);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::overview,
            commands::capture_hotkey,
            commands::cancel_hotkey_capture,
            commands::propose_hotkey,
            commands::confirm_hotkey,
            commands::set_autostart,
            commands::open_microphone_settings,
            commands::dismiss_overlay,
            commands::finish_first_run,
            commands::quit,
        ])
        .setup(|app| {
            let handle = app.handle();
            let settings_path = app.path().app_config_dir()?.join(config::FILE_NAME);
            let settings = config::load(&settings_path);
            let shell = Shell::start(handle, settings_path, settings.clone())?;
            tray::build(handle, shell.stub.mode())?;
            app.manage(shell);
            if !settings.first_run_done {
                first_run(handle);
            }
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

fn first_run(app: &AppHandle) {
    if !cfg!(debug_assertions)
        && let Err(error) = app.autolaunch().enable()
    {
        log::warn!("turning on autostart failed: {error}");
    }
    windows::open_first_run(app);
}

fn on_second_launch(app: &AppHandle, args: &[String]) {
    #[cfg(debug_assertions)]
    if dev::handle_args(app, args) {
        return;
    }
    let _ = args;
    windows::open_settings(app);
}
