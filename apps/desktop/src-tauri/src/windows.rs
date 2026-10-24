use std::sync::LazyLock;

use serde::Deserialize;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::config::Placement;
use crate::shell::Shell;

pub const MAIN: &str = "main";
pub const OVERLAY: &str = "overlay";
pub const UPDATE: &str = "update";

const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
                            --force-prefers-no-reduced-motion";

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
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Resizable {
    width: f64,
    height: f64,
    min_width: f64,
    min_height: f64,
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
    main: Resizable,
    update: Fitted,
    overlay: Size,
}

static SIZES: LazyLock<Sizes> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/windows.json"))
        .expect("src/windows.json describes every window")
});

const SCREEN_MARGIN: f64 = 48.0;

fn fitted_size(fitted: &Fitted, content_height: f64, available_height: f64) -> (f64, f64) {
    let height = content_height
        .ceil()
        .max(fitted.min_height)
        .min(available_height - SCREEN_MARGIN);
    (fitted.width, height)
}

fn available_height(window: &WebviewWindow) -> f64 {
    window
        .current_monitor()
        .ok()
        .flatten()
        .map_or(f64::MAX, |monitor| {
            f64::from(monitor.work_area().size.height) / monitor.scale_factor()
        })
}

fn top_inside(top: i32, height: u32, area_top: i32, area_height: u32) -> i32 {
    let area_bottom = area_top + area_height as i32;
    top.min(area_bottom - height as i32).max(area_top)
}

fn keep_inside(window: &WebviewWindow) -> tauri::Result<()> {
    let (Some(monitor), position, size) = (
        window.current_monitor()?,
        window.outer_position()?,
        window.outer_size()?,
    ) else {
        return Ok(());
    };
    let area = monitor.work_area();
    let top = top_inside(position.y, size.height, area.position.y, area.size.height);
    if top != position.y {
        window.set_position(PhysicalPosition::new(position.x, top))?;
    }
    Ok(())
}

#[tauri::command]
pub fn fit_update(app: AppHandle, content_height: f64, recenter: bool) {
    let Some(window) = app.get_webview_window(UPDATE) else {
        return;
    };
    let (width, height) = fitted_size(&SIZES.update, content_height, available_height(&window));
    let resized = window
        .set_size(LogicalSize::new(width, height))
        .and_then(|()| {
            if recenter {
                window.center()
            } else {
                keep_inside(&window)
            }
        });
    if let Err(error) = resized {
        log::warn!("fitting the update window failed: {error}");
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Area {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

const VISIBLE_GRIP: i32 = 64;

fn on_some_screen(placement: &Placement, areas: &[Area]) -> bool {
    areas.iter().any(|area| {
        let left = placement.x.max(area.x);
        let right = (placement.x + placement.width as i32).min(area.x + area.width);
        let top_visible = placement.y >= area.y && placement.y < area.y + area.height;
        top_visible && right - left >= VISIBLE_GRIP
    })
}

fn logical_areas(app: &AppHandle) -> Vec<Area> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let area = monitor.work_area();
            let logical = |value: f64| (value / scale).round() as i32;
            Area {
                x: logical(f64::from(area.position.x)),
                y: logical(f64::from(area.position.y)),
                width: logical(f64::from(area.size.width)),
                height: logical(f64::from(area.size.height)),
            }
        })
        .collect()
}

fn placement_of(window: &WebviewWindow) -> Option<Placement> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?.to_logical::<f64>(scale);
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    Some(Placement {
        x: position.x.round() as i32,
        y: position.y.round() as i32,
        width: size.width.round() as u32,
        height: size.height.round() as u32,
        maximized: false,
    })
}

fn remember(window: &WebviewWindow, shell: &Shell) {
    let maximized = window.is_maximized().unwrap_or(false);
    let minimized = window.is_minimized().unwrap_or(false);
    if minimized {
        return;
    }
    let normal = if maximized {
        None
    } else {
        placement_of(window)
    };
    shell.remember_main_window(normal, maximized);
}

pub fn add_word(app: &AppHandle) {
    open_main(app, "&section=dictionary&focus=add");
}

pub fn open_main(app: &AppHandle, query: &str) {
    if let Some(window) = app.get_webview_window(MAIN) {
        if !query.is_empty()
            && let Err(error) = app.emit_to(MAIN, "main-navigate", query)
        {
            log::warn!("moving the main window failed: {error}");
        }
        bring_to_front(&window);
        return;
    }
    let shell = app.state::<Shell>();
    let saved = shell
        .settings()
        .main_window
        .filter(|placement| on_some_screen(placement, &logical_areas(app)));
    let url = WebviewUrl::App(view_url(MAIN, query).into());
    let main = &SIZES.main;
    let mut builder = WebviewWindowBuilder::new(app, MAIN, url)
        .title(product_name(app))
        .additional_browser_args(BROWSER_ARGS)
        .min_inner_size(main.min_width, main.min_height)
        .resizable(true)
        .maximizable(true);
    builder = match saved {
        Some(placement) => builder
            .inner_size(
                f64::from(placement.width.max(main.min_width as u32)),
                f64::from(placement.height.max(main.min_height as u32)),
            )
            .position(f64::from(placement.x), f64::from(placement.y))
            .maximized(placement.maximized),
        None => builder
            .inner_size(main.width, main.height)
            .center()
            .maximized(true),
    };
    let window = match builder.build() {
        Ok(window) => window,
        Err(error) => {
            log::error!("opening the main window failed: {error}");
            return;
        }
    };
    shell.main_window_shown(true);
    bring_to_front(&window);
    let app = app.clone();
    let tracked = window.clone();
    window.on_window_event(move |event| {
        let shell = app.state::<Shell>();
        match event {
            WindowEvent::Resized(_) => {
                remember(&tracked, &shell);
                let minimized = tracked.is_minimized().unwrap_or(false);
                let visible = tracked.is_visible().unwrap_or(true);
                shell.main_window_shown(visible && !minimized);
            }
            WindowEvent::Moved(_) => remember(&tracked, &shell),
            WindowEvent::CloseRequested { .. } => {
                remember(&tracked, &shell);
                shell.save_main_window();
            }
            WindowEvent::Focused(false) => {
                if shell.cancel_capture_if_unfocused() {
                    crate::shell::capture_cancelled(&app);
                }
            }
            WindowEvent::Destroyed => {
                shell.check_microphone(false);
                if shell.cancel_capture() {
                    crate::shell::capture_cancelled(&app);
                }
            }
            _ => {}
        }
    });
}

fn bring_to_front(window: &WebviewWindow) {
    let shown = window
        .unminimize()
        .and_then(|()| window.show())
        .and_then(|()| window.set_focus());
    if let Err(error) = shown {
        log::warn!("bringing the main window to the front failed: {error}");
    }
}

pub fn open_update(app: &AppHandle) {
    if app.get_webview_window(UPDATE).is_some() {
        return;
    }
    let built =
        WebviewWindowBuilder::new(app, UPDATE, WebviewUrl::App(view_url(UPDATE, "").into()))
            .title(product_name(app))
            .additional_browser_args(BROWSER_ARGS)
            .inner_size(SIZES.update.width, SIZES.update.min_height)
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
    let language = crate::i18n::language().code();
    let theme = crate::theme::query();
    format!("index.html?view={label}&lang={language}{theme}{query}")
}

pub fn create_overlay(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let overlay =
        WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App(view_url(OVERLAY, "").into()))
            .title(product_name(app))
            .additional_browser_args(BROWSER_ARGS)
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
            .build()?;
    drop_frame(&overlay);
    crate::overlay::set_memory_target(&overlay, crate::overlay::MemoryTarget::Low);
    Ok(overlay)
}

fn drop_frame(window: &WebviewWindow) {
    #[cfg(windows)]
    if let Ok(handle) = window.hwnd() {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SetWindowPos,
        };
        let flags = SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER;
        if let Err(error) = unsafe { SetWindowPos(HWND(handle.0.cast()), None, 0, 0, 0, 0, flags) }
        {
            log::warn!("removing the overlay's frame failed: {error}");
        }
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_update_window_fits_each_phase_from_its_minimum() {
        let width = SIZES.update.width;
        assert_eq!(
            fitted_size(&SIZES.update, 0.0, 1080.0),
            (width, SIZES.update.min_height)
        );
        assert_eq!(fitted_size(&SIZES.update, 431.2, 1080.0), (width, 432.0));
    }

    #[test]
    fn a_grown_window_moves_up_only_as_far_as_it_must_to_stay_on_screen() {
        assert_eq!(top_inside(200, 600, 0, 1040), 200);
        assert_eq!(top_inside(600, 600, 0, 1040), 440);
        assert_eq!(top_inside(-30, 600, 0, 1040), 0);
        assert_eq!(top_inside(900, 1200, 0, 1040), 0);
        assert_eq!(top_inside(1500, 600, 1080, 1040), 1500);
    }

    #[test]
    fn a_saved_placement_is_reused_only_while_its_title_bar_is_on_a_screen() {
        let laptop = Area {
            x: 0,
            y: 0,
            width: 1536,
            height: 816,
        };
        let right = Area {
            x: 1536,
            y: 0,
            width: 1920,
            height: 1040,
        };
        let at = |x, y| Placement {
            x,
            y,
            width: 900,
            height: 640,
            maximized: false,
        };
        assert!(on_some_screen(&at(100, 80), &[laptop]));
        assert!(on_some_screen(&at(2000, 80), &[laptop, right]));
        assert!(!on_some_screen(&at(2000, 80), &[laptop]));
        assert!(!on_some_screen(&at(100, -200), &[laptop]));
        assert!(!on_some_screen(&at(1500, 80), &[laptop]));
    }
}
