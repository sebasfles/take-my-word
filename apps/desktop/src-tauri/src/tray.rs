use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use tauri::image::Image;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

use crate::audio::{MicStatus, MicrophoneStatus};
use crate::i18n::{Message, text};
use crate::shell::AppAccount;
use crate::{account, windows};

const TRAY: &str = "main";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayState {
    Idle,
    Recording,
    Attention,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Status {
    pub state: TrayState,
    pub message: Message,
}

pub fn status(signed_in: bool, microphone: MicStatus, listening: bool) -> Status {
    let (state, message) = if listening {
        (TrayState::Recording, Message::TrayListening)
    } else if !signed_in {
        (TrayState::Attention, Message::TraySignedOut)
    } else if microphone == MicStatus::Denied {
        (TrayState::Attention, Message::TrayMicrophoneBlocked)
    } else if microphone == MicStatus::Missing {
        (TrayState::Attention, Message::TrayMicrophoneMissing)
    } else {
        (TrayState::Idle, Message::TrayReady)
    };
    Status { state, message }
}

const SIZES: [u32; 4] = [16, 20, 24, 32];

macro_rules! state_frames {
    ($dir:literal, $state:literal) => {
        [
            include_bytes!(concat!("../icons/", $dir, "tray/", $state, "-16.png")),
            include_bytes!(concat!("../icons/", $dir, "tray/", $state, "-20.png")),
            include_bytes!(concat!("../icons/", $dir, "tray/", $state, "-24.png")),
            include_bytes!(concat!("../icons/", $dir, "tray/", $state, "-32.png")),
        ]
    };
}

macro_rules! frames {
    ($dir:literal) => {
        [
            state_frames!($dir, "idle"),
            state_frames!($dir, "recording"),
            state_frames!($dir, "attention"),
        ]
    };
}

const FRAMES: [[&[u8]; 4]; 3] = if cfg!(feature = "prd") {
    frames!("")
} else {
    frames!("dev/")
};

fn frame_index(scale: f64) -> usize {
    let wanted = 16.0 * scale;
    SIZES
        .iter()
        .position(|&size| f64::from(size) >= wanted - 0.5)
        .unwrap_or(SIZES.len() - 1)
}

fn frame(state: TrayState, scale: f64) -> &'static [u8] {
    let row = match state {
        TrayState::Idle => 0,
        TrayState::Recording => 1,
        TrayState::Attention => 2,
    };
    FRAMES[row][frame_index(scale)]
}

pub trait Painter: Send + Sync + 'static {
    fn paint(&self, status: Status) -> bool;
}

type Job = Box<dyn FnOnce() + Send>;
type Dispatch = Box<dyn Fn(Job) + Send + Sync>;
type Source<T> = Box<dyn Fn() -> T + Send + Sync>;

struct Inner {
    listening: AtomicBool,
    signed_in: Source<bool>,
    microphone: Source<MicStatus>,
    shown: Mutex<Option<Status>>,
    painter: Box<dyn Painter>,
}

impl Inner {
    fn apply(&self, force: bool) {
        let status = status(
            (self.signed_in)(),
            (self.microphone)(),
            self.listening.load(Ordering::SeqCst),
        );
        let mut shown = self.shown.lock().unwrap_or_else(PoisonError::into_inner);
        if (force || *shown != Some(status)) && self.painter.paint(status) {
            *shown = Some(status);
        }
    }
}

pub struct Indicator {
    inner: Arc<Inner>,
    dispatch: Dispatch,
}

impl Indicator {
    fn new(
        signed_in: Source<bool>,
        microphone: Source<MicStatus>,
        painter: Box<dyn Painter>,
        dispatch: Dispatch,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                listening: AtomicBool::new(false),
                signed_in,
                microphone,
                shown: Mutex::new(None),
                painter,
            }),
            dispatch,
        }
    }

    pub fn set_listening(&self, listening: bool) {
        self.inner.listening.store(listening, Ordering::SeqCst);
        self.refresh(false);
    }

    pub fn refresh(&self, force: bool) {
        let inner = Arc::clone(&self.inner);
        (self.dispatch)(Box::new(move || inner.apply(force)));
    }
}

struct TrayPainter(AppHandle);

impl Painter for TrayPainter {
    fn paint(&self, status: Status) -> bool {
        let Some(tray) = self.0.tray_by_id(TRAY) else {
            return false;
        };
        let scale = self
            .0
            .primary_monitor()
            .ok()
            .flatten()
            .map_or(1.0, |monitor| monitor.scale_factor());
        let tooltip = format!(
            "{}\n{}",
            windows::product_name(&self.0),
            text(status.message)
        );
        let painted = Image::from_bytes(frame(status.state, scale))
            .and_then(|icon| tray.set_icon(Some(icon)))
            .and_then(|()| tray.set_tooltip(Some(tooltip)));
        painted
            .inspect_err(|error| log::warn!("updating the tray icon failed: {error}"))
            .is_ok()
    }
}

fn on_main_thread(app: &AppHandle) -> Dispatch {
    let app = app.clone();
    Box::new(move |job| {
        if let Err(error) = app.run_on_main_thread(job) {
            log::warn!("scheduling a tray update failed: {error}");
        }
    })
}

fn refresh(app: &AppHandle, force: bool) {
    if let Some(indicator) = app.try_state::<Indicator>() {
        indicator.refresh(force);
    }
}

pub fn show_listening(app: &AppHandle, listening: bool) {
    if let Some(indicator) = app.try_state::<Indicator>() {
        indicator.set_listening(listening);
    }
}

const SETTINGS: &str = "settings";
const ADD_WORD: &str = "add-word";
const ACCOUNT: &str = "account";
const QUIT: &str = "quit";

struct Items {
    add_word: MenuItem<Wry>,
    settings: MenuItem<Wry>,
    account: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

fn account_label(signed_in: bool) -> &'static str {
    text(if signed_in {
        Message::TraySignOut
    } else {
        Message::TraySignIn
    })
}

pub fn show_signed_in(app: &AppHandle, signed_in: bool) {
    let handle = app.clone();
    let scheduled = app.run_on_main_thread(move || {
        if let Some(items) = handle.try_state::<Items>()
            && let Err(error) = items.account.set_text(account_label(signed_in))
        {
            log::warn!("updating the tray failed: {error}");
        }
    });
    if let Err(error) = scheduled {
        log::warn!("scheduling a tray update failed: {error}");
    }
    refresh(app, false);
}

pub fn relabel(app: &AppHandle, signed_in: bool) {
    let Some(items) = app.try_state::<Items>() else {
        return;
    };
    let relabeled = items
        .add_word
        .set_text(text(Message::TrayAddWord))
        .and_then(|()| items.settings.set_text(text(Message::TraySettings)))
        .and_then(|()| items.account.set_text(account_label(signed_in)))
        .and_then(|()| items.quit.set_text(text(Message::TrayQuit)));
    if let Err(error) = relabeled {
        log::warn!("relabeling the tray failed: {error}");
    }
    refresh(app, true);
}

pub fn build(
    app: &AppHandle,
    account: Arc<AppAccount>,
    microphone: MicrophoneStatus,
) -> tauri::Result<()> {
    let signed_in = account.is_signed_in();
    let live = microphone.clone();
    app.manage(Indicator::new(
        Box::new(move || account.is_signed_in()),
        Box::new(move || live.get()),
        Box::new(TrayPainter(app.clone())),
        on_main_thread(app),
    ));
    let listener = app.clone();
    microphone.on_change(move |_| refresh(&listener, false));
    let settings = MenuItem::with_id(
        app,
        SETTINGS,
        text(Message::TraySettings),
        true,
        None::<&str>,
    )?;
    let add_word = MenuItem::with_id(
        app,
        ADD_WORD,
        text(Message::TrayAddWord),
        true,
        None::<&str>,
    )?;
    let account_item =
        MenuItem::with_id(app, ACCOUNT, account_label(signed_in), true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, QUIT, text(Message::TrayQuit), true, None::<&str>)?;
    #[cfg(debug_assertions)]
    let stub = stub::Menu::build(app)?;
    let mut items: Vec<&dyn IsMenuItem<Wry>> = vec![&add_word, &settings, &account_item];
    #[cfg(debug_assertions)]
    items.push(&stub.submenu);
    items.extend([&separator as &dyn IsMenuItem<Wry>, &quit]);
    let menu = Menu::with_items(app, &items)?;
    let tray = TrayIconBuilder::with_id(TRAY)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            SETTINGS => windows::open_settings(app),
            ADD_WORD => windows::add_word(app),
            ACCOUNT => account::toggle_from_tray(app),
            QUIT => app.exit(0),
            #[cfg(debug_assertions)]
            id => stub.select(app, id),
            #[cfg(not(debug_assertions))]
            _ => {}
        });
    tray.build(app)?;
    app.manage(Items {
        add_word,
        settings,
        account: account_item,
        quit,
    });
    refresh(app, true);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn listening_wins_then_a_missing_session_then_the_microphone() {
        let state = |signed_in, microphone, listening| status(signed_in, microphone, listening);
        assert_eq!(
            state(true, MicStatus::Ready, false),
            Status {
                state: TrayState::Idle,
                message: Message::TrayReady
            }
        );
        assert_eq!(
            state(true, MicStatus::Ready, true).state,
            TrayState::Recording
        );
        assert_eq!(
            state(false, MicStatus::Denied, false).message,
            Message::TraySignedOut
        );
        assert_eq!(
            state(true, MicStatus::Denied, false),
            Status {
                state: TrayState::Attention,
                message: Message::TrayMicrophoneBlocked
            }
        );
        assert_eq!(
            state(true, MicStatus::Missing, false).message,
            Message::TrayMicrophoneMissing
        );
    }

    #[test]
    fn transient_microphone_trouble_leaves_the_tray_ready() {
        for microphone in [MicStatus::Unknown, MicStatus::Failing] {
            assert_eq!(status(true, microphone, false).state, TrayState::Idle);
        }
    }

    #[test]
    fn each_display_scale_gets_the_frame_drawn_for_it() {
        let size = |scale| SIZES[frame_index(scale)];
        assert_eq!(size(1.0), 16);
        assert_eq!(size(1.25), 20);
        assert_eq!(size(1.5), 24);
        assert_eq!(size(1.75), 32);
        assert_eq!(size(2.0), 32);
        assert_eq!(size(3.0), 32);
    }

    type Jobs = Arc<Mutex<Vec<Job>>>;

    struct Painted(Arc<Mutex<Vec<TrayState>>>);

    impl Painter for Painted {
        fn paint(&self, status: Status) -> bool {
            self.0.lock().unwrap().push(status.state);
            true
        }
    }

    fn indicator(
        microphone: Arc<Mutex<MicStatus>>,
    ) -> (Indicator, Jobs, Arc<Mutex<Vec<TrayState>>>) {
        let jobs: Jobs = Arc::default();
        let painted = Arc::<Mutex<Vec<TrayState>>>::default();
        let queue = Arc::clone(&jobs);
        let indicator = Indicator::new(
            Box::new(|| true),
            Box::new(move || *microphone.lock().unwrap()),
            Box::new(Painted(Arc::clone(&painted))),
            Box::new(move |job| queue.lock().unwrap().push(job)),
        );
        (indicator, jobs, painted)
    }

    fn run(jobs: &Jobs) {
        let pending = std::mem::take(&mut *jobs.lock().unwrap());
        for job in pending {
            job();
        }
    }

    #[test]
    fn a_hold_only_queues_the_tray_update_and_never_waits_for_it() {
        let (indicator, jobs, painted) = indicator(Arc::new(Mutex::new(MicStatus::Ready)));
        indicator.set_listening(true);
        indicator.set_listening(false);
        assert!(painted.lock().unwrap().is_empty());
        assert_eq!(jobs.lock().unwrap().len(), 2);
        run(&jobs);
        assert_eq!(*painted.lock().unwrap(), vec![TrayState::Idle]);
    }

    #[test]
    fn the_microphone_is_read_when_the_tray_paints_not_when_it_was_built() {
        let microphone = Arc::new(Mutex::new(MicStatus::Unknown));
        let (indicator, jobs, painted) = indicator(Arc::clone(&microphone));
        *microphone.lock().unwrap() = MicStatus::Denied;
        indicator.refresh(true);
        run(&jobs);
        assert_eq!(*painted.lock().unwrap(), vec![TrayState::Attention]);
    }

    #[test]
    fn an_unchanged_state_is_painted_again_only_when_forced() {
        let (indicator, jobs, painted) = indicator(Arc::new(Mutex::new(MicStatus::Ready)));
        indicator.refresh(false);
        indicator.refresh(false);
        indicator.refresh(true);
        run(&jobs);
        assert_eq!(
            *painted.lock().unwrap(),
            vec![TrayState::Idle, TrayState::Idle]
        );
    }

    #[test]
    fn every_frame_is_a_png_of_its_size() {
        for row in FRAMES {
            for (bytes, size) in row.iter().zip(SIZES) {
                assert_eq!(&bytes[1..4], b"PNG");
                let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
                let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
                assert_eq!((width, height), (size, size));
            }
        }
    }
}
