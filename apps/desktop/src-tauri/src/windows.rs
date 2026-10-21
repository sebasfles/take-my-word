use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

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

struct Size {
    width: f64,
    height: f64,
    min: Option<(f64, f64)>,
}

const fn fixed(width: f64, height: f64) -> Size {
    Size {
        width,
        height,
        min: None,
    }
}

const SETTINGS_SIZE: Size = Size {
    width: 880.0,
    height: 640.0,
    min: Some((380.0, 480.0)),
};

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
    let Some(window) = open(app, SETTINGS, query, &product_name(app), SETTINGS_SIZE) else {
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
        fixed(520.0, 470.0),
    );
}

pub fn retitle(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(FIRST_RUN) {
        let _ = window.set_title(i18n::text(Message::FirstRunTitle));
    }
}

pub fn open_account(app: &AppHandle, onboarding: bool) {
    let query = if onboarding { "&step=onboarding" } else { "" };
    let _ = open(app, ACCOUNT, query, &product_name(app), fixed(440.0, 560.0));
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
        .resizable(size.min.is_some())
        .maximizable(size.min.is_some())
        .center();
    if let Some((width, height)) = size.min {
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
            .inner_size(460.0, 400.0)
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
    format!("index.html?view={label}&lang={language}{query}")
}

pub fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App(view_url(OVERLAY, "").into()))
        .title(product_name(app))
        .inner_size(480.0, 96.0)
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
