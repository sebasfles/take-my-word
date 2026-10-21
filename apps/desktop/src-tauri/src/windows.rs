use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::shell::Shell;

pub const SETTINGS: &str = "settings";
pub const FIRST_RUN: &str = "first-run";
pub const ACCOUNT: &str = "account";
pub const OVERLAY: &str = "overlay";

pub fn open_settings(app: &AppHandle) {
    let Some(window) = open(app, SETTINGS, "", "Take My Word", (480.0, 560.0)) else {
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
        "Welcome to Take My Word",
        (520.0, 470.0),
    );
}

pub fn open_account(app: &AppHandle, onboarding: bool) {
    let query = if onboarding { "&step=onboarding" } else { "" };
    let _ = open(app, ACCOUNT, query, "Take My Word", (440.0, 560.0));
}

fn open(
    app: &AppHandle,
    label: &str,
    query: &str,
    title: &str,
    (width, height): (f64, f64),
) -> Option<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return None;
    }
    let url = WebviewUrl::App(format!("index.html?view={label}{query}").into());
    let built = WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(width, height)
        .resizable(false)
        .maximizable(false)
        .center()
        .build();
    built
        .inspect_err(|error| log::error!("opening {label} failed: {error}"))
        .ok()
}

pub fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(
        app,
        OVERLAY,
        WebviewUrl::App("index.html?view=overlay".into()),
    )
    .title("Take My Word overlay")
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
    .map(|overlay| crate::overlay::set_memory_target(&overlay, crate::overlay::MemoryTarget::Low))
}
