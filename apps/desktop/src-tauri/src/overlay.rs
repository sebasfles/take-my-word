use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalRect, WindowEvent};

use crate::audio::Level;
use crate::dictation::Notifier;
use crate::i18n::Message;
use crate::overlay_health::{Health, PAINT_DEADLINE, READY_DEADLINE, verdict};
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

    pub fn window(&self) -> &O {
        &self.inner
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

#[derive(Serialize)]
struct Shown<'a> {
    seq: u64,
    #[serde(flatten)]
    state: &'a OverlayState,
}

struct Lifecycle {
    health: Health,
    current: OverlayState,
    rebuilding: bool,
    content_scale: Option<f64>,
}

#[derive(Clone)]
pub struct WindowOverlay {
    app: AppHandle,
    generation: Arc<AtomicU64>,
    lifecycle: Arc<Mutex<Lifecycle>>,
}

impl WindowOverlay {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            generation: Arc::new(AtomicU64::new(0)),
            lifecycle: Arc::new(Mutex::new(Lifecycle {
                health: Health::new(Instant::now()),
                current: OverlayState::Hidden,
                rebuilding: false,
                content_scale: None,
            })),
        }
    }

    fn lifecycle(&self) -> MutexGuard<'_, Lifecycle> {
        self.lifecycle
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    pub fn create(&self) -> tauri::Result<()> {
        let window = crate::windows::create_overlay(&self.app)?;
        log::info!("created the overlay");
        keep_content_scale(&window);
        self.lifecycle().content_scale = window.scale_factor().ok();
        let overlay = self.clone();
        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::Destroyed) {
                overlay.destroyed();
            }
        });
        let overlay = self.clone();
        watch_processes(&window, move |failure, replace| {
            log::warn!("an overlay WebView2 process failed: {failure}");
            if replace {
                overlay.lifecycle().health.failed();
                overlay.check();
            }
        });
        let overlay = self.clone();
        thread::spawn(move || {
            thread::sleep(READY_DEADLINE);
            overlay.check();
        });
        Ok(())
    }

    pub fn ready(&self) {
        let current = {
            let mut lifecycle = self.lifecycle();
            lifecycle.health.ready();
            lifecycle.current.clone()
        };
        if current != OverlayState::Hidden {
            self.set(current);
        }
    }

    pub fn painted(&self, seq: u64) {
        self.lifecycle().health.painted(seq);
    }

    fn show_at_scale(&self, window: &tauri::WebviewWindow, scale: f64, generation: u64) {
        #[cfg(windows)]
        {
            let overlay = self.clone();
            let target = window.clone();
            let queued = window.with_webview(move |webview| {
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller3;
                use windows::core::Interface;
                let applied = webview
                    .controller()
                    .cast::<ICoreWebView2Controller3>()
                    .and_then(|controller| unsafe { controller.SetRasterizationScale(scale) });
                if let Err(error) = applied {
                    log::warn!("scaling the overlay's content failed: {error}");
                }
                if overlay.generation.load(Ordering::SeqCst) == generation {
                    set_shown(&target, true);
                }
            });
            if queued.is_ok() {
                return;
            }
        }
        let _ = scale;
        let _ = generation;
        set_shown(window, true);
    }

    #[cfg(debug_assertions)]
    pub fn stop_frames(&self) {
        let Some(window) = self.app.get_webview_window(OVERLAY) else {
            return;
        };
        #[cfg(windows)]
        let _ = window.with_webview(|webview| {
            let _ = unsafe { webview.controller().SetIsVisible(false) };
        });
        #[cfg(not(windows))]
        let _ = window;
    }

    fn check(&self) {
        let repair = {
            let mut lifecycle = self.lifecycle();
            let now = Instant::now();
            let repair = verdict(&lifecycle.health, now);
            if repair.is_some() {
                lifecycle.health.recreated(now);
                lifecycle.rebuilding = true;
            } else if lifecycle.health.gave_up() {
                log::warn!("the overlay still paints no frames after being recreated");
            }
            repair
        };
        let Some(repair) = repair else {
            return;
        };
        log::warn!("recreating the overlay: {repair}");
        let overlay = self.clone();
        if let Err(error) = self.app.run_on_main_thread(move || overlay.rebuild()) {
            log::error!("queueing the overlay's recreation failed: {error}");
        }
    }

    fn rebuild(&self) {
        let Some(window) = self.app.get_webview_window(OVERLAY) else {
            self.lifecycle().rebuilding = false;
            self.recreate();
            return;
        };
        if let Err(error) = window.destroy() {
            log::error!("closing the overlay to recreate it failed: {error}");
        }
    }

    fn destroyed(&self) {
        if !std::mem::take(&mut self.lifecycle().rebuilding) {
            return;
        }
        let overlay = self.clone();
        if let Err(error) = self.app.run_on_main_thread(move || overlay.recreate()) {
            log::error!("queueing the overlay's recreation failed: {error}");
        }
    }

    fn recreate(&self) {
        if let Err(error) = self.create() {
            log::error!("recreating the overlay failed: {error}");
        }
    }
}

impl Overlay for WindowOverlay {
    fn set(&self, state: OverlayState) {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let shown = state != OverlayState::Hidden;
        let ready = {
            let mut lifecycle = self.lifecycle();
            lifecycle.current = state.clone();
            if shown {
                lifecycle.health.shown(generation, Instant::now());
            } else {
                lifecycle.health.hidden(Instant::now());
            }
            lifecycle.health.is_ready()
        };
        let Some(window) = self.app.get_webview_window(OVERLAY) else {
            return;
        };
        if shown && !ready {
            log::info!("showing the overlay before its page is ready");
        }
        let event = Shown {
            seq: generation,
            state: &state,
        };
        if let Err(error) = self.app.emit_to(OVERLAY, "overlay", &event) {
            log::warn!("updating the overlay failed: {error}");
        }
        if !shown {
            set_shown(&window, false);
            set_memory_target(&window, MemoryTarget::Low);
            self.check();
            return;
        }
        set_memory_target(&window, MemoryTarget::Normal);
        let scale = place_above_taskbar(&self.app, &window);
        let rescale =
            scale.filter(|scale| self.lifecycle().content_scale.replace(*scale) != Some(*scale));
        match rescale {
            Some(scale) => self.show_at_scale(&window, scale, generation),
            None => set_shown(&window, true),
        }
        let overlay = self.clone();
        thread::spawn(move || {
            thread::sleep(PAINT_DEADLINE);
            overlay.check();
        });
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

fn place_above_taskbar(app: &AppHandle, window: &tauri::WebviewWindow) -> Option<f64> {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|cursor| app.monitor_from_point(cursor.x, cursor.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let _ = window.set_position(above_taskbar(monitor.work_area(), scale));
    let _ = window.set_size(crate::windows::overlay_size(scale));
    Some(scale)
}

fn above_taskbar(area: &PhysicalRect<i32, u32>, scale: f64) -> PhysicalPosition<i32> {
    let size = crate::windows::overlay_size(scale);
    let margin = (BOTTOM_MARGIN * scale).round() as i32;
    let x = area.position.x + (area.size.width as i32 - size.width as i32) / 2;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - margin;
    PhysicalPosition::new(x, y)
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

fn keep_content_scale(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    let _ = window.with_webview(|webview| {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller3;
        use windows::core::Interface;
        let kept = webview
            .controller()
            .cast::<ICoreWebView2Controller3>()
            .and_then(|controller| unsafe { controller.SetShouldDetectMonitorScaleChanges(false) });
        if let Err(error) = kept {
            log::warn!("taking over the overlay's content scale failed: {error}");
        }
    });
    #[cfg(not(windows))]
    let _ = window;
}

fn watch_processes(
    window: &tauri::WebviewWindow,
    on_failure: impl Fn(&'static str, bool) + Send + 'static,
) {
    #[cfg(windows)]
    let _ = window.with_webview(move |webview| {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_PROCESS_FAILED_KIND,
            COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
        };
        use webview2_com::ProcessFailedEventHandler;
        let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
            let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
            if let Some(args) = args {
                unsafe { args.ProcessFailedKind(&mut kind) }?;
            }
            let (failure, replace) = match kind {
                COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED => {
                    ("the browser process exited", true)
                }
                COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED => {
                    ("the renderer exited", true)
                }
                COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE => {
                    ("the renderer stopped responding", true)
                }
                COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED => {
                    ("a frame renderer exited", true)
                }
                COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED => {
                    ("the GPU process exited", true)
                }
                _ => ("a helper process exited", false),
            };
            on_failure(failure, replace);
            Ok(())
        }));
        let mut token = 0;
        let watched = unsafe { webview.controller().CoreWebView2() }
            .and_then(|core| unsafe { core.add_ProcessFailed(&handler, &mut token) });
        if let Err(error) = watched {
            log::warn!("watching the overlay's WebView2 processes failed: {error}");
        }
    });
    #[cfg(not(windows))]
    let _ = (window, on_failure);
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
    fn the_overlay_is_centred_above_the_taskbar_at_the_scale_of_the_monitor_it_goes_to() {
        let area = |x: i32, width: u32, height: u32, taskbar: u32| PhysicalRect {
            position: PhysicalPosition::new(x, 0),
            size: tauri::PhysicalSize::new(width, height - taskbar),
        };
        let laptop = area(0, 1920, 1080, 0);
        let right = area(1920, 1920, 1080, 48);
        assert_eq!(
            above_taskbar(&laptop, 1.25),
            PhysicalPosition::new(660, 870)
        );
        assert_eq!(above_taskbar(&right, 1.0), PhysicalPosition::new(2640, 864));
        assert_eq!(above_taskbar(&right, 1.5), PhysicalPosition::new(2520, 780));
    }

    #[test]
    fn every_state_reaches_the_page_with_the_number_its_paint_is_confirmed_by() {
        let shown = |state: &OverlayState| {
            serde_json::to_value(Shown { seq: 7, state }).expect("the overlay event serializes")
        };
        assert_eq!(
            shown(&OverlayState::Listening),
            serde_json::json!({ "seq": 7, "state": "listening" })
        );
        let error = shown(&OverlayState::Error {
            message: Message::DictationUnreachable,
            action: Some(OverlayAction::MicrophoneSettings),
        });
        assert_eq!(error["seq"], 7);
        assert_eq!(error["state"], "error");
        assert_eq!(error["action"], "microphoneSettings");
        assert!(error["message"].is_string());
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
