use tauri::AppHandle;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;

use crate::windows;

const SETTINGS: &str = "settings";
const QUIT: &str = "quit";

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, SETTINGS, "Settings", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, QUIT, "Quit", true, None::<&str>)?;
    #[cfg(debug_assertions)]
    let stub = stub::Menu::build(app)?;
    let mut items: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![&settings];
    #[cfg(debug_assertions)]
    items.push(&stub.submenu);
    items.extend([&separator as &dyn IsMenuItem<tauri::Wry>, &quit]);
    let menu = Menu::with_items(app, &items)?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip(
            app.config()
                .product_name
                .as_deref()
                .unwrap_or("Take My Word"),
        )
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            SETTINGS => windows::open_settings(app),
            QUIT => app.exit(0),
            #[cfg(debug_assertions)]
            id => stub.select(app, id),
            #[cfg(not(debug_assertions))]
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg(debug_assertions)]
mod stub {
    use tauri::menu::{CheckMenuItem, IsMenuItem, Submenu};
    use tauri::{AppHandle, Manager, Wry};

    use crate::api::StubMode;
    use crate::shell::Shell;

    pub struct Menu {
        pub submenu: Submenu<Wry>,
        modes: Vec<CheckMenuItem<Wry>>,
    }

    impl Menu {
        pub fn build(app: &AppHandle) -> tauri::Result<Self> {
            let current = app.state::<Shell>().stub.mode();
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
            let items: Vec<&dyn IsMenuItem<Wry>> = modes.iter().map(|item| item as _).collect();
            let submenu = Submenu::with_items(app, "API stub", true, &items)?;
            Ok(Self { submenu, modes })
        }

        pub fn select(&self, app: &AppHandle, id: &str) {
            let Some(mode) = StubMode::ALL.into_iter().find(|mode| mode.id() == id) else {
                return;
            };
            app.state::<Shell>().stub.set_mode(mode);
            for item in &self.modes {
                let _ = item.set_checked(item.id().as_ref() == id);
            }
            log::info!("API stub mode: {}", mode.label());
        }
    }
}
