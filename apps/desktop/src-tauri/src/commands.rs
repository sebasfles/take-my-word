use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;

use crate::account::Problem;
use crate::audio::MicStatus;
use crate::foreground;
use crate::i18n::{self, Message};
use crate::locale::{self, Language};
use crate::overlay::{Overlay, OverlayState};
use crate::shell::Shell;
use crate::theme::{self, Theme};
use crate::{tray, windows};

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
    version: String,
}

#[tauri::command]
pub fn overview(app: AppHandle, shell: State<'_, Shell>) -> Overview {
    Overview {
        hotkey: shell.hotkey().labels(),
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        microphone: shell.microphone.get(),
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
pub fn capture_hotkey(app: AppHandle, shell: State<'_, Shell>) -> Result<(), Problem> {
    let visible = app
        .get_webview_window(windows::MAIN)
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
pub fn overlay_ready(shell: State<'_, Shell>) {
    shell.overlay.window().ready();
}

#[tauri::command]
pub fn overlay_painted(shell: State<'_, Shell>, seq: u64) {
    shell.overlay.window().painted(seq);
}

#[tauri::command]
pub fn forward_key(shell: State<'_, Shell>, code: String, down: bool) {
    shell.forward_key(&code, down);
}

#[tauri::command]
pub fn insert_ack(shell: State<'_, Shell>, id: u64, inserted: bool) {
    shell.acks.answer(id, inserted);
}

#[tauri::command]
pub fn stop_dictation(shell: State<'_, Shell>) {
    shell.stop_dictation();
}

#[tauri::command]
pub fn check_microphone(shell: State<'_, Shell>, on: bool) -> MicStatus {
    shell.check_microphone(on);
    shell.microphone.get()
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiLanguage {
    choice: Option<Language>,
    windows: Language,
}

#[tauri::command]
pub fn ui_language(shell: State<'_, Shell>) -> UiLanguage {
    UiLanguage {
        choice: shell.settings().ui_language,
        windows: locale::system_language(),
    }
}

#[tauri::command]
pub fn set_ui_language(
    app: AppHandle,
    shell: State<'_, Shell>,
    choice: Option<Language>,
) -> UiLanguage {
    shell.update_settings(|settings| settings.ui_language = choice);
    let language = i18n::choose(choice);
    log::info!("ui language: {}", language.code());
    tray::relabel(&app, shell.account.is_signed_in());
    if let Err(error) = app.emit("ui-language", language) {
        log::warn!("announcing the ui language failed: {error}");
    }
    UiLanguage {
        choice,
        windows: locale::system_language(),
    }
}

#[tauri::command]
pub fn theme() -> Option<Theme> {
    theme::choice()
}

#[tauri::command]
pub fn set_theme(app: AppHandle, shell: State<'_, Shell>, choice: Option<Theme>) -> Option<Theme> {
    shell.update_settings(|settings| settings.theme = choice);
    apply_theme(&app, choice);
    log::info!("theme: {}", choice.map_or("windows", Theme::code));
    if let Err(error) = app.emit("theme", choice) {
        log::warn!("announcing the theme failed: {error}");
    }
    choice
}

pub fn apply_theme(app: &AppHandle, choice: Option<Theme>) {
    theme::choose(choice);
    app.set_theme(Theme::native(choice));
}
