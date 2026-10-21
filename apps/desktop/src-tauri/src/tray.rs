use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

use crate::{account, windows};

const SETTINGS: &str = "settings";
const ACCOUNT: &str = "account";
const QUIT: &str = "quit";

struct AccountItem(MenuItem<Wry>);

fn account_label(signed_in: bool) -> &'static str {
    if signed_in { "Sign out" } else { "Sign in" }
}

pub fn show_signed_in(app: &AppHandle, signed_in: bool) {
    if let Some(item) = app.try_state::<AccountItem>()
        && let Err(error) = item.0.set_text(account_label(signed_in))
    {
        log::warn!("updating the tray failed: {error}");
    }
}

pub fn build(app: &AppHandle, signed_in: bool) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, SETTINGS, "Settings", true, None::<&str>)?;
    let account_item =
        MenuItem::with_id(app, ACCOUNT, account_label(signed_in), true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, QUIT, "Quit", true, None::<&str>)?;
    #[cfg(debug_assertions)]
    let stub = stub::Menu::build(app)?;
    let mut items: Vec<&dyn IsMenuItem<Wry>> = vec![&settings, &account_item];
    #[cfg(debug_assertions)]
    items.push(&stub.submenu);
    items.extend([&separator as &dyn IsMenuItem<Wry>, &quit]);
    let menu = Menu::with_items(app, &items)?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip(windows::product_name(app))
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            SETTINGS => windows::open_settings(app),
            ACCOUNT => account::toggle_from_tray(app),
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
    app.manage(AccountItem(account_item));
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
