use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;

use crate::audio::MicStatus;
use crate::foreground;
use crate::overlay::{Overlay, OverlayState};
use crate::shell::Shell;
use crate::windows;

const MICROPHONE_SETTINGS: &str = "ms-settings:privacy-microphone";

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
pub fn capture_hotkey(app: AppHandle, shell: State<'_, Shell>) -> Result<(), String> {
    let visible = app
        .get_webview_window(windows::SETTINGS)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if !visible || !foreground::foreground_is_this_process() {
        return Err("Click Change in the settings window to record a shortcut.".into());
    }
    shell.start_capture(&app);
    Ok(())
}

#[tauri::command]
pub fn propose_hotkey(shell: State<'_, Shell>, codes: Vec<String>) -> Result<Vec<String>, String> {
    shell.propose_hotkey(&codes)
}

#[tauri::command]
pub fn confirm_hotkey(shell: State<'_, Shell>) -> Result<Vec<String>, String> {
    shell
        .confirm_hotkey()
        .map(|hotkey| hotkey.labels())
        .ok_or_else(|| "There is no new shortcut to save.".into())
}

#[tauri::command]
pub fn cancel_hotkey_capture(shell: State<'_, Shell>) {
    shell.cancel_capture();
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let autolaunch = app.autolaunch();
    let changed = if enabled {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    changed.map_err(|error| error.to_string())?;
    autolaunch.is_enabled().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_microphone_settings(app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(MICROPHONE_SETTINGS, None::<&str>)
        .map_err(|error| error.to_string())
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
