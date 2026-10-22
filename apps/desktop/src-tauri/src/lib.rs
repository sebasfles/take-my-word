mod account;
mod activity;
mod api;
mod audio;
mod auth;
mod clipboard;
mod commands;
mod config;
#[cfg(debug_assertions)]
mod dev;
mod dictation;
mod editors;
mod env;
mod foreground;
mod hotkey;
mod i18n;
mod keychain;
mod locale;
mod overlay;
mod paste;
mod rules;
mod session;
mod shell;
mod theme;
mod tray;
mod updater;
mod windows;

use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_autostart::ManagerExt;

use crate::shell::Shell;

pub fn run() {
    let context = tauri::generate_context!();
    let updates = updater::enabled(context.config());
    let mut builder = tauri::Builder::default();
    if updates {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }
    let app = builder
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
            account::account_status,
            account::sign_in,
            account::choose_password,
            account::onboarding,
            account::save_onboarding,
            account::open_sign_in,
            account::sign_out,
            editors::api_request,
            editors::running_apps,
            editors::copy_text,
            commands::ui_language,
            commands::set_ui_language,
            commands::theme,
            commands::set_theme,
            commands::quit,
            updater::update_view,
            updater::install_update,
            updater::postpone_update,
        ])
        .setup(move |app| {
            let handle = app.handle();
            env::check_identifier(&app.config().identifier)?;
            let settings_path = app.path().app_config_dir()?.join(config::FILE_NAME);
            let settings = config::load(&settings_path);
            i18n::choose(settings.ui_language);
            commands::apply_theme(handle, settings.theme);
            let shell = Shell::start(handle, settings_path, settings.clone())?;
            let signed_in = shell.account.is_signed_in();
            app.manage(updater::Updates::new());
            if updates {
                updater::start(handle, shell.activity.clone());
            }
            app.manage(shell);
            tray::build(handle, signed_in)?;
            if !settings.first_run_done {
                turn_on_autostart(handle);
            }
            account::on_startup(handle);
            Ok(())
        })
        .build(context)
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

fn turn_on_autostart(app: &AppHandle) {
    if !cfg!(debug_assertions)
        && let Err(error) = app.autolaunch().enable()
    {
        log::warn!("turning on autostart failed: {error}");
    }
}

fn on_second_launch(app: &AppHandle, args: &[String]) {
    #[cfg(debug_assertions)]
    if dev::handle_args(app, args) {
        return;
    }
    let _ = args;
    windows::open_settings(app);
}
