use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;

use crate::account::Problem;
use crate::audio::MicStatus;
use crate::foreground;
use crate::i18n::Message;
use crate::overlay::{Overlay, OverlayState};
use crate::shell::Shell;
use crate::windows;

const MICROPHONE_SETTINGS: &str = "ms-settings:privacy-microphone";

pub async fn blocking<T: Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&AppHandle, &Shell) -> T + Send + 'static,
) -> T {
    tauri::async_runtime::spawn_blocking(move || work(&app, app.state::<Shell>().inner()))
        .await
        .expect("a blocking command panicked")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    hotkey: Vec<String>,
    autostart: bool,
    microphone: MicStatus,
}

#[tauri::command]
pub fn overview(app: AppHandle, shell: State<'_, Shell>) -> Overview {
    Overview {
        hotkey: shell.hotkey().labels(),
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        microphone: shell.microphone.get(),
    }
}

#[tauri::command]
pub fn capture_hotkey(app: AppHandle, shell: State<'_, Shell>) -> Result<(), Problem> {
    let visible = app
        .get_webview_window(windows::SETTINGS)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if !visible || !foreground::foreground_is_this_process() {
        return Err(Message::HotkeyNotInSettings.into());
    }
    shell.start_capture(&app);
    Ok(())
}

#[tauri::command]
pub fn propose_hotkey(shell: State<'_, Shell>, codes: Vec<String>) -> Result<Vec<String>, Problem> {
    shell.propose_hotkey(&codes).map_err(Problem::from)
}

#[tauri::command]
pub fn confirm_hotkey(shell: State<'_, Shell>) -> Result<Vec<String>, Problem> {
    shell
        .confirm_hotkey()
        .map(|hotkey| hotkey.labels())
        .ok_or_else(|| Message::HotkeyNothingToSave.into())
}

#[tauri::command]
pub fn cancel_hotkey_capture(shell: State<'_, Shell>) {
    shell.cancel_capture();
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, Problem> {
    let autolaunch = app.autolaunch();
    let changed = if enabled {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    changed
        .and_then(|()| autolaunch.is_enabled())
        .map_err(|error| failed("changing autostart", &error))
}

#[tauri::command]
pub fn open_microphone_settings(app: AppHandle) -> Result<(), Problem> {
    app.opener()
        .open_url(MICROPHONE_SETTINGS, None::<&str>)
        .map_err(|error| failed("opening the microphone settings", &error))
}

fn failed(what: &str, error: &dyn std::fmt::Display) -> Problem {
    log::warn!("{what} failed: {error}");
    Message::Generic.into()
}

#[tauri::command]
pub fn dismiss_overlay(shell: State<'_, Shell>) {
    shell.overlay.set(OverlayState::Hidden);
}

#[tauri::command]
pub fn finish_first_run(app: AppHandle, shell: State<'_, Shell>) {
    shell.update_settings(|settings| settings.first_run_done = true);
    if let Some(window) = app.get_webview_window(windows::FIRST_RUN) {
        let _ = window.close();
    }
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}
