use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

use crate::windows::OVERLAY;

const ERROR_VISIBLE: Duration = Duration::from_secs(4);
const BOTTOM_MARGIN: f64 = 72.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OverlayAction {
    MicrophoneSettings,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum OverlayState {
    Hidden,
    Listening,
    Processing,
    Error {
        message: String,
        action: Option<OverlayAction>,
    },
}

pub trait Overlay {
    fn set(&self, state: OverlayState);
}

#[derive(Clone)]
pub struct WindowOverlay {
    app: AppHandle,
    generation: Arc<AtomicU64>,
}

impl WindowOverlay {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            generation: Arc::new(AtomicU64::new(0)),
        }
    }
}

impl Overlay for WindowOverlay {
    fn set(&self, state: OverlayState) {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let Some(window) = self.app.get_webview_window(OVERLAY) else {
            return;
        };
        if let Err(error) = self.app.emit_to(OVERLAY, "overlay", &state) {
            log::warn!("updating the overlay failed: {error}");
        }
        if state == OverlayState::Hidden {
            let _ = window.hide();
            set_memory_target(&window, MemoryTarget::Low);
            return;
        }
        set_memory_target(&window, MemoryTarget::Normal);
        place_above_taskbar(&self.app, &window);
        let _ = window.show();
        if matches!(state, OverlayState::Error { .. }) {
            let overlay = self.clone();
            thread::spawn(move || {
                thread::sleep(ERROR_VISIBLE);
                if overlay.generation.load(Ordering::SeqCst) == generation {
                    overlay.set(OverlayState::Hidden);
                }
            });
        }
    }
}

fn place_above_taskbar(app: &AppHandle, window: &tauri::WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|cursor| app.monitor_from_point(cursor.x, cursor.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size)) = (monitor, window.outer_size()) else {
        return;
    };
    let area = monitor.work_area();
    let margin = (BOTTOM_MARGIN * monitor.scale_factor()) as i32;
    let x = area.position.x + (area.size.width as i32 - size.width as i32) / 2;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - margin;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

#[derive(Clone, Copy)]
pub enum MemoryTarget {
    Low,
    Normal,
}

pub fn set_memory_target(window: &tauri::WebviewWindow, target: MemoryTarget) {
    #[cfg(windows)]
    let _ = window.with_webview(move |webview| {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL, ICoreWebView2_19,
        };
        use windows::core::Interface;
        let level = match target {
            MemoryTarget::Low => COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
            MemoryTarget::Normal => COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        };
        let applied = unsafe { webview.controller().CoreWebView2() }
            .and_then(|core| core.cast::<ICoreWebView2_19>())
            .and_then(|core| unsafe { core.SetMemoryUsageTargetLevel(level) });
        if let Err(error) = applied {
            log::debug!("setting the overlay memory target failed: {error}");
        }
    });
    #[cfg(not(windows))]
    let _ = (window, target);
}
