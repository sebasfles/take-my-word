use std::sync::LazyLock;

use serde::Deserialize;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

use crate::i18n::{self, Message};
use crate::shell::Shell;

pub const SETTINGS: &str = "settings";
pub const FIRST_RUN: &str = "first-run";
pub const ACCOUNT: &str = "account";
pub const OVERLAY: &str = "overlay";
pub const UPDATE: &str = "update";

pub fn product_name(app: &AppHandle) -> String {
    app.config()
        .product_name
        .clone()
        .unwrap_or_else(|| "Take My Word".into())
}

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Size {
    width: f64,
    height: f64,
    #[serde(default)]
    min_width: Option<f64>,
    #[serde(default)]
    min_height: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fitted {
    width: f64,
    min_height: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Sizes {
    settings: Size,
    account: Size,
    onboarding: Fitted,
    first_run: Size,
    update: Size,
    overlay: Size,
}

static SIZES: LazyLock<Sizes> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/windows.json"))
        .expect("src/windows.json describes every window")
});

const SCREEN_MARGIN: f64 = 48.0;

fn account_size(onboarding: bool, content_height: f64, available_height: f64) -> (f64, f64) {
    if !onboarding {
        return (SIZES.account.width, SIZES.account.height);
    }
    let height = content_height
        .ceil()
        .max(SIZES.onboarding.min_height)
        .min(available_height - SCREEN_MARGIN);
    (SIZES.onboarding.width, height)
}

fn available_height(window: &tauri::WebviewWindow) -> f64 {
    window
        .current_monitor()
        .ok()
        .flatten()
        .map_or(f64::MAX, |monitor| {
            f64::from(monitor.work_area().size.height) / monitor.scale_factor()
        })
}

#[tauri::command]
pub fn fit_account(app: AppHandle, onboarding: bool, content_height: f64) {
    let Some(window) = app.get_webview_window(ACCOUNT) else {
        return;
    };
    let (width, height) = account_size(onboarding, content_height, available_height(&window));
    let resized = window
        .set_size(LogicalSize::new(width, height))
        .and_then(|()| window.center());
    if let Err(error) = resized {
        log::warn!("fitting the account window failed: {error}");
    }
}

const ADD_WORD: &str = "&section=dictionary&focus=add";

pub fn add_word(app: &AppHandle) {
    if app.get_webview_window(SETTINGS).is_some()
        && let Err(error) = app.emit_to(SETTINGS, "settings-navigate", ADD_WORD)
    {
        log::warn!("moving settings to the dictionary failed: {error}");
    }
    open_settings_with(app, ADD_WORD);
}

pub fn open_settings(app: &AppHandle) {
    open_settings_with(app, "");
}

fn open_settings_with(app: &AppHandle, query: &str) {
    let Some(window) = open(app, SETTINGS, query, &product_name(app), SIZES.settings) else {
        return;
    };
    let app = app.clone();
    window.on_window_event(move |event| {
        let shell = app.state::<Shell>();
        let cancelled = match event {
            WindowEvent::Focused(false) => shell.cancel_capture_if_unfocused(),
            WindowEvent::Destroyed => shell.cancel_capture(),
            _ => false,
        };
        if cancelled {
            crate::shell::capture_cancelled(&app);
        }
    });
}

pub fn open_first_run(app: &AppHandle) {
    let _ = open(
        app,
        FIRST_RUN,
        "",
        i18n::text(Message::FirstRunTitle),
        SIZES.first_run,
    );
}

pub fn retitle(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(FIRST_RUN) {
        let _ = window.set_title(i18n::text(Message::FirstRunTitle));
    }
}

pub fn open_account(app: &AppHandle, onboarding: bool) {
    let query = if onboarding { "&step=onboarding" } else { "" };
    let (width, height) = account_size(onboarding, 0.0, f64::MAX);
    let size = Size {
        width,
        height,
        min_width: None,
        min_height: None,
    };
    let _ = open(app, ACCOUNT, query, &product_name(app), size);
}

fn open(
    app: &AppHandle,
    label: &str,
    query: &str,
    title: &str,
    size: Size,
) -> Option<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return None;
    }
    let url = WebviewUrl::App(view_url(label, query).into());
    let mut builder = WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(size.width, size.height)
        .resizable(size.min_width.is_some())
        .maximizable(size.min_width.is_some())
        .center();
    if let (Some(width), Some(height)) = (size.min_width, size.min_height) {
        builder = builder.min_inner_size(width, height);
    }
    let built = builder.build();
    built
        .inspect_err(|error| log::error!("opening {label} failed: {error}"))
        .ok()
}

pub fn open_update(app: &AppHandle) {
    if app.get_webview_window(UPDATE).is_some() {
        return;
    }
    let built =
        WebviewWindowBuilder::new(app, UPDATE, WebviewUrl::App(view_url(UPDATE, "").into()))
            .title(product_name(app))
            .inner_size(SIZES.update.width, SIZES.update.height)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .center()
            .focused(false)
            .build();
    match built {
        Ok(window) => {
            let app = app.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Destroyed = event {
                    crate::updater::postpone(&app);
                }
            });
        }
        Err(error) => log::error!("opening {UPDATE} failed: {error}"),
    }
}

fn view_url(label: &str, query: &str) -> String {
    let language = i18n::language().code();
    let theme = crate::theme::query();
    format!("index.html?view={label}&lang={language}{theme}{query}")
}

pub fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App(view_url(OVERLAY, "").into()))
        .title(product_name(app))
        .inner_size(SIZES.overlay.width, SIZES.overlay.height)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focusable(false)
        .focused(false)
        .visible(false)
        .build()
        .map(|overlay| {
            crate::overlay::set_memory_target(&overlay, crate::overlay::MemoryTarget::Low)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_in_and_choose_password_share_one_size_whatever_their_content() {
        let fixed = (SIZES.account.width, SIZES.account.height);
        assert_eq!(account_size(false, 0.0, 1080.0), fixed);
        assert_eq!(account_size(false, 900.0, 1080.0), fixed);
    }

    #[test]
    fn onboarding_fits_its_content_within_the_screen() {
        let width = SIZES.onboarding.width;
        assert_eq!(account_size(true, 612.3, 1080.0), (width, 613.0));
        assert_eq!(
            account_size(true, 10.0, 1080.0),
            (width, SIZES.onboarding.min_height)
        );
        assert_eq!(account_size(true, 2000.0, 1032.0), (width, 984.0));
    }
}
