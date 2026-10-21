use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const SETTINGS: &str = "settings";

pub fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(
        app,
        SETTINGS,
        WebviewUrl::App("index.html?view=settings".into()),
    )
    .title("Take My Word")
    .inner_size(480.0, 560.0)
    .resizable(false)
    .maximizable(false)
    .center()
    .build();
    if let Err(error) = built {
        log::error!("opening settings failed: {error}");
    }
}
