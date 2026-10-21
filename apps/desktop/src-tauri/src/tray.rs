use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};

use crate::api::StubMode;
use crate::shell::Shell;
use crate::windows;

const SETTINGS: &str = "settings";
const QUIT: &str = "quit";

pub fn build(app: &AppHandle, current: StubMode) -> tauri::Result<()> {
    let modes = StubMode::ALL
        .iter()
        .map(|mode| {
            CheckMenuItem::with_id(
                app,
                mode.id(),
                mode.label(),
                true,
                *mode == current,
                None::<&str>,
            )
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let mode_items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        modes.iter().map(|item| item as _).collect();
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, SETTINGS, "Settings", true, None::<&str>)?,
            &Submenu::with_items(app, "API stub", true, &mode_items)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, QUIT, "Quit", true, None::<&str>)?,
        ],
    )?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Take My Word")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            SETTINGS => windows::open_settings(app),
            QUIT => app.exit(0),
            id => {
                let Some(mode) = StubMode::ALL.into_iter().find(|mode| mode.id() == id) else {
                    return;
                };
                app.state::<Shell>().stub.set_mode(mode);
                for item in &modes {
                    let _ = item.set_checked(item.id().as_ref() == id);
                }
                log::info!("API stub mode: {}", mode.label());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
