use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, mpsc};
use std::thread;
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::activity::{Activity, Busy};
use crate::api::{AuthedApi, HttpApi};
#[cfg(debug_assertions)]
use crate::api::{Stub, Stubbed};
use crate::audio::{Microphone, MicrophoneStatus};
use crate::auth::account::{Account, CognitoProvider};
use crate::auth::cognito::Cognito;
use crate::clipboard;
use crate::config::{self, Settings};
use crate::dictation::{Job, Notifier, Worker};
use crate::foreground::{self, ActiveWindow, ForegroundApp, SystemWindow};
use crate::hotkey::{self, CAPTURE_TIMEOUT, Hotkey, HotkeyKey, Key, KeyHook, Keys, Side};
use crate::i18n::{self, Message};
use crate::keychain::SystemKeychain;
use crate::locale;
use crate::overlay::{GatedOverlay, Overlay, OverlayState, WindowOverlay};
use crate::paste::{EnigoKeystroke, Modifiers, Paster, Timing};
use crate::session::{Input, Session, Sink, Take};
use crate::windows;
use crate::{account, env};

#[cfg(debug_assertions)]
const STUB_DELAY: std::time::Duration = std::time::Duration::from_millis(700);

pub type AppAccount = Account<CognitoProvider, SystemKeychain>;
pub type AppApi = AuthedApi<Arc<AppAccount>>;

pub struct Shell {
    pub account: Arc<AppAccount>,
    pub api: AppApi,
    #[cfg(debug_assertions)]
    pub stub: Stub,
    pub overlay: GatedOverlay<WindowOverlay, TrayNotifier>,
    pub microphone: MicrophoneStatus,
    pub activity: Activity,
    #[cfg(debug_assertions)]
    pub jobs: mpsc::Sender<Job>,
    keys: Arc<Mutex<Keys>>,
    session: mpsc::Sender<Input>,
    settings: Mutex<Settings>,
    settings_path: PathBuf,
    proposed: Mutex<Option<Hotkey>>,
}

impl Shell {
    pub fn start(
        app: &AppHandle,
        settings_path: PathBuf,
        settings: Settings,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        windows::create_overlay(app)?;
        let overlay = GatedOverlay::new(WindowOverlay::new(app.clone()), TrayNotifier(app.clone()));
        let microphone = Microphone::spawn()?;
        let microphone_status = microphone.status();
        let provider = CognitoProvider {
            cognito: Cognito::for_environment(env::CURRENT)?,
            device_name: device_name(app),
        };
        let keychain = SystemKeychain::new(env::CURRENT.identifier)?;
        let listener_app = app.clone();
        let account = Arc::new(Account::restore(
            provider,
            keychain,
            Box::new(move |signed_in| account::changed(&listener_app, signed_in)),
        ));
        let api = AuthedApi::new(HttpApi::new(env::CURRENT.api_url)?, Arc::clone(&account));
        let dictation_api = api.clone();
        #[cfg(debug_assertions)]
        let stub = Stub::start(STUB_DELAY)?;
        #[cfg(debug_assertions)]
        let dictation_api = Stubbed::new(stub.clone(), dictation_api)?;
        let keys = Arc::new(Mutex::new(Keys::new(settings.hotkey.clone())));
        let (session, session_inbox) = mpsc::channel();
        let (jobs, job_inbox) = mpsc::channel();

        let keyboard = install_hook(&keys, &session);
        let paste = Paster {
            clipboard: clipboard::system(),
            keystroke: EnigoKeystroke,
            window: SystemWindow,
            modifiers: HeldModifiers {
                keyboard,
                keys: Arc::clone(&keys),
            },
            timing: Timing::default(),
        };
        let mut worker = Worker {
            api: dictation_api,
            paste,
            overlay: overlay.clone(),
            notifier: TrayNotifier(app.clone()),
            locale: locale::system_locale(),
        };
        thread::Builder::new()
            .name("dictation".into())
            .spawn(move || job_inbox.into_iter().for_each(|job| worker.handle(job)))?;
        let activity = Activity::default();
        let sink = ShellSink {
            app: app.clone(),
            account: Arc::clone(&account),
            overlay: overlay.clone(),
            jobs: jobs.clone(),
            target: ForegroundApp::default(),
            activity: activity.clone(),
            busy: None,
        };
        thread::Builder::new()
            .name("session".into())
            .spawn(move || Session::new(microphone, sink).run(session_inbox))?;

        Ok(Self {
            account,
            api,
            #[cfg(debug_assertions)]
            stub,
            overlay,
            microphone: microphone_status,
            activity,
            #[cfg(debug_assertions)]
            jobs,
            keys,
            session,
            settings: Mutex::new(settings),
            settings_path,
            proposed: Mutex::new(None),
        })
    }

    pub fn settings(&self) -> Settings {
        lock(&self.settings).clone()
    }

    pub fn update_settings(&self, change: impl FnOnce(&mut Settings)) {
        let mut settings = lock(&self.settings);
        change(&mut settings);
        if let Err(error) = config::save(&self.settings_path, &settings) {
            log::error!("saving settings failed: {error}");
        }
    }

    pub fn hotkey(&self) -> Hotkey {
        lock(&self.keys).hotkey().clone()
    }

    pub fn start_capture(&self, app: &AppHandle) {
        let started = Instant::now();
        *lock(&self.proposed) = None;
        let interrupted = lock(&self.keys).start_capture(started);
        if let Some(event) = interrupted {
            let _ = self.session.send(Input::Chord { event, at: started });
        }
        let app = app.clone();
        thread::spawn(move || {
            thread::sleep(CAPTURE_TIMEOUT);
            let shell = app.state::<Shell>();
            if lock(&shell.keys).expire_capture(started + CAPTURE_TIMEOUT) {
                *lock(&shell.proposed) = None;
                capture_cancelled(&app);
            }
        });
    }

    pub fn propose_hotkey(&self, codes: &[String]) -> Result<Vec<String>, Message> {
        if !lock(&self.keys).is_capturing(Instant::now()) {
            return Err(Message::HotkeyCaptureEnded);
        }
        let pressed = codes
            .iter()
            .map(|code| Key::from_dom(code))
            .collect::<Option<Vec<_>>>();
        let Some(pressed) = pressed else {
            lock(&self.keys).finish_capture(None);
            return Err(Message::HotkeyKeyNotAllowed);
        };
        match Hotkey::from_pressed(&pressed) {
            Ok(hotkey) => {
                let labels = hotkey.labels();
                log::info!("hotkey capture proposed {}", labels.join("+"));
                *lock(&self.proposed) = Some(hotkey);
                Ok(labels)
            }
            Err(error) => {
                log::info!("hotkey capture rejected: {error}");
                lock(&self.keys).finish_capture(None);
                Err(error.message())
            }
        }
    }

    pub fn cancel_capture(&self) -> bool {
        *lock(&self.proposed) = None;
        lock(&self.keys).finish_capture(None)
    }

    pub fn cancel_capture_if_unfocused(&self) -> bool {
        let cancelled =
            lock(&self.keys).cancel_capture_unless(foreground::foreground_is_this_process());
        if cancelled {
            *lock(&self.proposed) = None;
        }
        cancelled
    }

    pub fn confirm_hotkey(&self) -> Option<Hotkey> {
        let hotkey = lock(&self.proposed).take()?;
        log::info!("hotkey saved {}", hotkey.labels().join("+"));
        lock(&self.keys).finish_capture(Some(hotkey.clone()));
        self.update_settings(|settings| settings.hotkey = hotkey.clone());
        Some(hotkey)
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn install_hook(
    keys: &Arc<Mutex<Keys>>,
    session: &mpsc::Sender<Input>,
) -> Option<Arc<dyn KeyHook + Send + Sync>> {
    let keys = Arc::clone(keys);
    let session = session.clone();
    let installed = hotkey::install(Box::new(move |event, keyboard| {
        if let Some(event) = lock(&keys).on_key(event, keyboard) {
            let _ = session.send(Input::Chord {
                event,
                at: Instant::now(),
            });
        }
    }));
    installed.inspect_err(|error| log::error!("{error}")).ok()
}

pub fn capture_cancelled(app: &AppHandle) {
    log::info!("hotkey capture cancelled");
    let _ = app.emit_to(windows::SETTINGS, "hotkey-capture-cancelled", ());
}

fn device_name(app: &AppHandle) -> String {
    let product = windows::product_name(app);
    match std::env::var("COMPUTERNAME") {
        Ok(computer) if !computer.is_empty() => format!("{product} on {computer}"),
        _ => product,
    }
}

struct ShellSink {
    app: AppHandle,
    account: Arc<AppAccount>,
    overlay: GatedOverlay<WindowOverlay, TrayNotifier>,
    jobs: mpsc::Sender<Job>,
    target: ForegroundApp,
    activity: Activity,
    busy: Option<Busy>,
}

impl Sink for ShellSink {
    fn may_record(&mut self) -> bool {
        if self.account.is_signed_in() {
            self.account.renew_in_background();
            return true;
        }
        self.overlay.set(OverlayState::Error {
            message: Message::SignInToDictate,
            action: None,
        });
        windows::open_account(&self.app, false);
        false
    }

    fn listening(&mut self) {
        self.busy = Some(self.activity.start());
        self.overlay.begin_recording();
        self.target = SystemWindow.foreground();
    }

    fn finished(&mut self, take: Take) {
        self.overlay.end_recording();
        let _ = self.jobs.send(Job {
            take,
            target: std::mem::take(&mut self.target),
            busy: self.busy.take().unwrap_or_else(|| self.activity.start()),
        });
    }
}

struct HeldModifiers {
    keyboard: Option<Arc<dyn KeyHook + Send + Sync>>,
    keys: Arc<Mutex<Keys>>,
}

impl Modifiers for HeldModifiers {
    fn any_held(&self) -> bool {
        let Some(keyboard) = &self.keyboard else {
            return false;
        };
        let hotkey_codes = lock(&self.keys)
            .hotkey()
            .keys()
            .iter()
            .filter_map(|key| match key {
                HotkeyKey::Code(code) => Some(Key::Other(*code)),
                _ => None,
            })
            .collect::<Vec<_>>();
        [Side::Left, Side::Right]
            .into_iter()
            .flat_map(|side| {
                [
                    Key::Ctrl(side),
                    Key::Shift(side),
                    Key::Alt(side),
                    Key::Meta(side),
                ]
            })
            .chain(hotkey_codes)
            .any(|key| keyboard.is_held(key))
    }
}

#[derive(Clone)]
pub struct TrayNotifier(AppHandle);

impl Notifier for TrayNotifier {
    fn notify(&self, sentence: &[Message]) {
        let shown = self
            .0
            .notification()
            .builder()
            .title(windows::product_name(&self.0))
            .body(i18n::sentence(sentence))
            .show();
        if let Err(error) = shown {
            log::warn!("showing a notification failed: {error}");
        }
    }
}
