use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

use crate::audio::Level;
use crate::dictation::Notifier;
use crate::i18n::Message;
use crate::windows::OVERLAY;

const ERROR_VISIBLE: Duration = Duration::from_secs(4);
const BOTTOM_MARGIN: f64 = 72.0;
const LEVEL_EVERY: Duration = Duration::from_millis(50);

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
    HandsFree,
    Processing,
    Error {
        message: Message,
        action: Option<OverlayAction>,
    },
}

pub trait Overlay {
    fn set(&self, state: OverlayState);
}

#[derive(Clone)]
pub struct GatedOverlay<O, N> {
    inner: O,
    notifier: N,
    recording: Arc<Mutex<bool>>,
}

impl<O: Overlay, N: Notifier> GatedOverlay<O, N> {
    pub fn new(inner: O, notifier: N) -> Self {
        Self {
            inner,
            notifier,
            recording: Arc::new(Mutex::new(false)),
        }
    }

    pub fn begin_recording(&self) {
        let mut recording = self
            .recording
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        *recording = true;
        self.inner.set(OverlayState::Listening);
    }

    pub fn hands_free(&self) {
        let recording = self
            .recording
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if *recording {
            self.inner.set(OverlayState::HandsFree);
        }
    }

    pub fn end_recording(&self) {
        *self
            .recording
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = false;
    }
}

impl<O: Overlay, N: Notifier> Overlay for GatedOverlay<O, N> {
    fn set(&self, state: OverlayState) {
        let recording = self
            .recording
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if !*recording || matches!(state, OverlayState::Listening | OverlayState::HandsFree) {
            self.inner.set(state);
            return;
        }
        log::info!("kept the overlay on listening during a hold");
        if let OverlayState::Error { message, .. } = state {
            self.notifier.notify(&[Message::PreviousNotPasted, message]);
        }
    }
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
            set_shown(&window, false);
            set_memory_target(&window, MemoryTarget::Low);
            return;
        }
        set_memory_target(&window, MemoryTarget::Normal);
        place_above_taskbar(&self.app, &window);
        set_shown(&window, true);
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

pub struct Waveform {
    app: AppHandle,
    level: Level,
    target: &'static str,
    event: &'static str,
    running: Option<Arc<AtomicBool>>,
}

impl Waveform {
    pub fn new(app: AppHandle, level: Level, target: &'static str, event: &'static str) -> Self {
        Self {
            app,
            level,
            target,
            event,
            running: None,
        }
    }

    pub fn start(&mut self) {
        self.stop();
        let running = Arc::new(AtomicBool::new(true));
        self.running = Some(Arc::clone(&running));
        let (app, level) = (self.app.clone(), self.level.clone());
        let (target, event) = (self.target, self.event);
        let spawned = thread::Builder::new()
            .name("waveform".into())
            .spawn(move || {
                pump(&level, &running, LEVEL_EVERY, |value| {
                    let _ = app.emit_to(target, event, value);
                });
            });
        if let Err(error) = spawned {
            log::warn!("starting the waveform failed: {error}");
        }
    }

    pub fn stop(&mut self) {
        if let Some(running) = self.running.take() {
            running.store(false, Ordering::Relaxed);
        }
    }
}

fn pump(level: &Level, running: &AtomicBool, every: Duration, mut emit: impl FnMut(f32)) {
    while running.load(Ordering::Relaxed) {
        emit(level.get());
        thread::sleep(every);
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

fn set_shown(window: &tauri::WebviewWindow, shown: bool) {
    #[cfg(windows)]
    if let Ok(handle) = window.hwnd() {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{SW_HIDE, SW_SHOWNOACTIVATE, ShowWindow};
        let hwnd = HWND(handle.0.cast());
        let _ = unsafe { ShowWindow(hwnd, if shown { SW_SHOWNOACTIVATE } else { SW_HIDE }) };
        return;
    }
    let _ = if shown { window.show() } else { window.hide() };
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

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;

    #[derive(Default)]
    struct Seen {
        overlay: RefCell<Vec<OverlayState>>,
        notices: RefCell<Vec<Vec<Message>>>,
    }

    impl Overlay for &Seen {
        fn set(&self, state: OverlayState) {
            self.overlay.borrow_mut().push(state);
        }
    }

    impl Notifier for &Seen {
        fn notify(&self, sentence: &[Message]) {
            self.notices.borrow_mut().push(sentence.to_vec());
        }
    }

    #[test]
    fn the_waveform_sends_the_latest_level_until_the_hold_ends() {
        let level = Level::default();
        let running = AtomicBool::new(true);
        let mut sent = Vec::new();
        pump(&level, &running, Duration::ZERO, |value| {
            sent.push(value);
            level.set(sent.len() as f32 / 10.0);
            if sent.len() == 3 {
                running.store(false, Ordering::Relaxed);
            }
        });
        assert_eq!(sent, vec![0.0, 0.1, 0.2]);
        pump(&level, &running, Duration::ZERO, |_| {
            panic!("sent while idle")
        });
    }

    #[test]
    fn a_dictation_finishing_during_the_next_hold_leaves_the_overlay_on_listening() {
        let seen = Seen::default();
        let overlay = GatedOverlay::new(&seen, &seen);
        overlay.begin_recording();
        overlay.set(OverlayState::Hidden);
        overlay.set(OverlayState::Processing);
        assert_eq!(*seen.overlay.borrow(), vec![OverlayState::Listening]);
        assert!(seen.notices.borrow().is_empty());
        overlay.end_recording();
        overlay.set(OverlayState::Processing);
        assert_eq!(
            *seen.overlay.borrow(),
            vec![OverlayState::Listening, OverlayState::Processing]
        );
    }

    #[test]
    fn hands_free_replaces_listening_only_while_the_recording_is_open() {
        let seen = Seen::default();
        let overlay = GatedOverlay::new(&seen, &seen);
        overlay.hands_free();
        overlay.begin_recording();
        overlay.hands_free();
        overlay.set(OverlayState::Processing);
        overlay.end_recording();
        overlay.hands_free();
        assert_eq!(
            *seen.overlay.borrow(),
            vec![OverlayState::Listening, OverlayState::HandsFree]
        );
    }

    #[test]
    fn an_error_held_back_during_a_hold_still_reaches_the_user() {
        let seen = Seen::default();
        let overlay = GatedOverlay::new(&seen, &seen);
        overlay.begin_recording();
        overlay.set(OverlayState::Error {
            message: Message::DictationUnreachable,
            action: None,
        });
        assert_eq!(*seen.overlay.borrow(), vec![OverlayState::Listening]);
        assert_eq!(
            *seen.notices.borrow(),
            vec![vec![
                Message::PreviousNotPasted,
                Message::DictationUnreachable
            ]]
        );
    }
}
