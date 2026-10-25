use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError, mpsc};
use std::thread;
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::activity::{Activity, Busy};
use crate::api::{ApiFailure, AppRuleList, AuthedApi, HttpApi};
#[cfg(debug_assertions)]
use crate::api::{Stub, Stubbed};
use crate::audio::{Microphone, MicrophoneStatus};
use crate::auth::account::{Account, AccountError, CognitoProvider};
use crate::auth::cognito::Cognito;
use crate::clipboard::{self, Clipboard, ClipboardError};
use crate::config::{self, Placement, Settings};
use crate::dictation::{Job, Notifier, Worker};
use crate::foreground::{self, ActiveWindow, ForegroundApp, SystemWindow};
use crate::hotkey::{
    self, CAPTURE_TIMEOUT, Hotkey, HotkeyKey, Key, KeyEvent, KeyHook, Keys, Side, Source,
};
use crate::i18n::{self, Message};
use crate::keychain::SystemKeychain;
use crate::overlay::{GatedOverlay, Overlay, OverlayState, Waveform, WindowOverlay};
use crate::own_window::{ACK_TIMEOUT, Acks, Keeper, OwnWindowFirst, Page};
use crate::paste::{EnigoKeystroke, Modifiers, Paster, Timing};
use crate::rules::{RuleCache, RuleSource};
use crate::segments::{self, Policy, Support, TakeSegments};
use crate::server::{SelfHosted, Server};
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
    official: Server,
    pub rules: Arc<RuleCache>,
    #[cfg(debug_assertions)]
    pub stub: Stub,
    pub overlay: GatedOverlay<WindowOverlay, TrayNotifier>,
    pub microphone: MicrophoneStatus,
    pub activity: Activity,
    pub acks: Acks,
    #[cfg(debug_assertions)]
    pub jobs: mpsc::Sender<Job>,
    segment_support: Support,
    keys: Arc<Mutex<Keys>>,
    keyboard: Arc<dyn KeyHook + Send + Sync>,
    session: mpsc::Sender<Input>,
    microphone_check: Mutex<(CheckGate, Waveform)>,
    main_window: Mutex<Option<Placement>>,
    settings: Mutex<Settings>,
    settings_path: PathBuf,
    proposed: Mutex<Option<Hotkey>>,
    copies: OnceLock<Mutex<Box<dyn Clipboard + Send>>>,
}

impl Shell {
    pub fn start(
        app: &AppHandle,
        settings_path: PathBuf,
        mut settings: Settings,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let window_overlay = WindowOverlay::new(app.clone());
        window_overlay.create()?;
        let overlay = GatedOverlay::new(window_overlay, TrayNotifier(app.clone()));
        let microphone = Microphone::spawn()?;
        let microphone_status = microphone.status();
        let waveform = Waveform::new(
            app.clone(),
            microphone.level(),
            windows::OVERLAY,
            "overlay-level",
        );
        let microphone_check = Waveform::new(
            app.clone(),
            microphone.level(),
            windows::MAIN,
            "microphone-level",
        );
        let official = env::official_server()?;
        settings.server = settings.server.take().and_then(|chosen| {
            chosen
                .checked()
                .inspect_err(|error| {
                    log::warn!("the stored server is not valid, using the official one: {error}");
                })
                .ok()
        });
        let server = settings
            .server
            .as_ref()
            .map_or(&official, |chosen| &chosen.server);
        let provider = CognitoProvider::new(Cognito::for_server(server)?, device_name(app));
        let keychain = SystemKeychain::new(env::CURRENT.identifier)?;
        let listener_app = app.clone();
        let account = Arc::new(Account::restore(
            provider,
            keychain,
            Box::new(move |signed_in| account::changed(&listener_app, signed_in)),
        ));
        let api = AuthedApi::new(HttpApi::new(server.api_url.clone())?, Arc::clone(&account));
        let rules = Arc::new(RuleCache::default());
        let dictation_api = api.clone();
        let segment_api = api.clone();
        #[cfg(debug_assertions)]
        let stub = Stub::start(STUB_DELAY)?;
        #[cfg(debug_assertions)]
        let dictation_api = Stubbed::new(stub.clone(), dictation_api)?;
        #[cfg(debug_assertions)]
        let segment_api = Stubbed::new(stub.clone(), segment_api)?;
        let (segment_jobs, segment_inbox) = mpsc::channel();
        thread::Builder::new()
            .name("segments".into())
            .spawn(move || segments::serve(&segment_api, segment_inbox))?;
        let segment_support = Support::default();
        let policy = settings.segmentation.unwrap_or_default().checked();
        let keys = Arc::new(Mutex::new(Keys::new(settings.hotkey.clone())));
        let (session, session_inbox) = mpsc::channel();
        let (jobs, job_inbox) = mpsc::channel();

        let keyboard = install_hook(&keys, &session);
        let paste = Paster {
            clipboard: clipboard::system(),
            keystroke: EnigoKeystroke,
            window: SystemWindow,
            modifiers: HeldModifiers {
                keyboard: keyboard.clone(),
                keys: Arc::clone(&keys),
            },
            timing: Timing::default(),
        };
        let acks = Acks::default();
        let paste = OwnWindowFirst {
            page: AppPage(app.clone()),
            keeper: AppKeeper(app.clone()),
            acks: acks.clone(),
            others: paste,
            timeout: ACK_TIMEOUT,
            next_id: 0,
        };
        let mut worker = Worker {
            api: dictation_api,
            paste,
            overlay: overlay.clone(),
            notifier: TrayNotifier(app.clone()),
            keystrokes: Arc::clone(&rules),
            grace: segments::GRACE,
        };
        thread::Builder::new()
            .name("dictation".into())
            .spawn(move || job_inbox.into_iter().for_each(|job| worker.handle(job)))?;
        let activity = Activity::default();
        let sink = ShellSink {
            app: app.clone(),
            account: Arc::clone(&account),
            api: api.clone(),
            rules: Arc::clone(&rules),
            overlay: overlay.clone(),
            jobs: jobs.clone(),
            target: ForegroundApp::default(),
            waveform,
            activity: activity.clone(),
            busy: None,
            keys: Arc::clone(&keys),
            keyboard: keyboard.clone().unwrap_or_else(|| Arc::new(NoHook)),
            segment_jobs,
            segment_support: segment_support.clone(),
            policy,
        };
        thread::Builder::new()
            .name("session".into())
            .spawn(move || Session::new(microphone, sink).run(session_inbox))?;

        Ok(Self {
            account,
            api,
            official,
            rules,
            #[cfg(debug_assertions)]
            stub,
            overlay,
            microphone: microphone_status,
            activity,
            acks,
            #[cfg(debug_assertions)]
            jobs,
            segment_support,
            keys,
            keyboard: keyboard.unwrap_or_else(|| Arc::new(NoHook)),
            session,
            microphone_check: Mutex::new((CheckGate::default(), microphone_check)),
            main_window: Mutex::new(settings.main_window),
            settings: Mutex::new(settings),
            settings_path,
            proposed: Mutex::new(None),
            copies: OnceLock::new(),
        })
    }

    pub fn official(&self) -> &Server {
        &self.official
    }

    pub fn use_server(&self, chosen: Option<SelfHosted>) -> Result<(), AccountError> {
        let server = chosen
            .as_ref()
            .map_or(&self.official, |chosen| &chosen.server)
            .clone();
        self.account.while_signed_out(|provider| {
            provider
                .connect(&server)
                .map_err(|error| AccountError::Unavailable(error.to_string()))?;
            self.api.set_base_url(&server.api_url);
            self.segment_support.reset();
            log::info!(
                "server: {}",
                chosen
                    .as_ref()
                    .map_or("the official one", |chosen| chosen.domain.as_str())
            );
            self.update_settings(|settings| settings.server = chosen);
            Ok(())
        })?
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

    pub fn remember_main_window(&self, normal: Option<Placement>, maximized: bool) {
        let mut remembered = lock(&self.main_window);
        *remembered = normal.or(*remembered).map(|placement| Placement {
            maximized,
            ..placement
        });
    }

    pub fn save_main_window(&self) {
        let placement = *lock(&self.main_window);
        if placement.is_some() && placement != self.settings().main_window {
            self.update_settings(|settings| settings.main_window = placement);
        }
    }

    pub fn copy(&self, text: &str) -> Result<(), ClipboardError> {
        let copies = self.copies.get_or_init(|| Mutex::new(clipboard::system()));
        lock(copies).put_text(text)
    }

    pub fn reload_rules(&self) {
        self.rules.load(&self.api);
    }

    pub fn forward_key(&self, code: &str, down: bool) {
        let Some(key) = Key::from_dom(code) else {
            return;
        };
        let at = Instant::now();
        let event = KeyEvent { key, down };
        if let Some(event) = lock(&self.keys).on_key(event, Source::Page, at, &*self.keyboard) {
            let _ = self.session.send(Input::Chord { event, at });
        }
    }

    pub fn stop_dictation(&self) {
        let _ = self.session.send(Input::Stop { at: Instant::now() });
    }

    pub fn check_microphone(&self, on: bool) {
        let mut check = lock(&self.microphone_check);
        let change = check.0.want(on);
        self.apply_check(&mut check.1, change);
    }

    pub fn main_window_shown(&self, shown: bool) {
        let mut check = lock(&self.microphone_check);
        let change = check.0.show(shown);
        self.apply_check(&mut check.1, change);
    }

    fn apply_check(&self, waveform: &mut Waveform, change: Option<bool>) {
        let Some(on) = change else {
            return;
        };
        if on {
            waveform.start();
        } else {
            waveform.stop();
        }
        let _ = self.session.send(Input::MicrophoneCheck(on));
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
        let at = Instant::now();
        if let Some(event) = lock(&keys).on_key(event, Source::Hook, at, keyboard) {
            let _ = session.send(Input::Chord { event, at });
        }
    }));
    installed.inspect_err(|error| log::error!("{error}")).ok()
}

pub fn capture_cancelled(app: &AppHandle) {
    log::info!("hotkey capture cancelled");
    let _ = app.emit_to(windows::MAIN, "hotkey-capture-cancelled", ());
}

fn device_name(app: &AppHandle) -> String {
    let product = windows::product_name(app);
    match std::env::var("COMPUTERNAME") {
        Ok(computer) if !computer.is_empty() => format!("{product} on {computer}"),
        _ => product,
    }
}

impl RuleSource for AppApi {
    fn app_rules(&self) -> Result<AppRuleList, ApiFailure> {
        AuthedApi::app_rules(self)
    }
}

struct ShellSink {
    app: AppHandle,
    account: Arc<AppAccount>,
    api: AppApi,
    rules: Arc<RuleCache>,
    overlay: GatedOverlay<WindowOverlay, TrayNotifier>,
    jobs: mpsc::Sender<Job>,
    target: ForegroundApp,
    waveform: Waveform,
    activity: Activity,
    busy: Option<Busy>,
    keys: Arc<Mutex<Keys>>,
    keyboard: Arc<dyn KeyHook + Send + Sync>,
    segment_jobs: mpsc::Sender<segments::Job>,
    segment_support: Support,
    policy: Policy,
}

impl Sink for ShellSink {
    fn segments(&mut self) -> Option<(TakeSegments, Policy)> {
        (self.policy.enabled && self.segment_support.available()).then(|| {
            (
                TakeSegments::new(self.segment_jobs.clone(), self.segment_support.clone()),
                self.policy,
            )
        })
    }

    fn may_record(&mut self) -> bool {
        if self.account.is_signed_in() {
            self.account.renew_in_background();
            if self.rules.claim_refresh(Instant::now()) {
                let (api, rules) = (self.api.clone(), Arc::clone(&self.rules));
                thread::spawn(move || rules.load(&api));
            }
            return true;
        }
        self.overlay.set(OverlayState::Error {
            message: Message::SignInToDictate,
            action: None,
        });
        windows::open_main(&self.app, "");
        false
    }

    fn listening(&mut self) {
        self.busy = Some(self.activity.start());
        self.overlay.begin_recording();
        crate::tray::show_listening(&self.app, true);
        self.waveform.start();
        self.target = SystemWindow.foreground();
    }

    fn hands_free(&mut self) {
        hotkey::swallow_escape(true);
        self.overlay.hands_free();
    }

    fn chord_released(&mut self) -> bool {
        lock(&self.keys).release_if_up(&*self.keyboard).is_some()
    }

    fn finished(&mut self, take: Take) {
        hotkey::swallow_escape(false);
        self.waveform.stop();
        self.overlay.end_recording();
        crate::tray::show_listening(&self.app, false);
        let _ = self.jobs.send(Job {
            take,
            target: std::mem::take(&mut self.target),
            busy: self.busy.take().unwrap_or_else(|| self.activity.start()),
        });
    }
}

#[derive(Debug)]
struct CheckGate {
    wanted: bool,
    shown: bool,
}

impl Default for CheckGate {
    fn default() -> Self {
        Self {
            wanted: false,
            shown: true,
        }
    }
}

impl CheckGate {
    fn running(&self) -> bool {
        self.wanted && self.shown
    }

    fn change(&mut self, update: impl FnOnce(&mut Self)) -> Option<bool> {
        let before = self.running();
        update(self);
        let after = self.running();
        (before != after).then_some(after)
    }

    fn want(&mut self, wanted: bool) -> Option<bool> {
        self.change(|gate| gate.wanted = wanted)
    }

    fn show(&mut self, shown: bool) -> Option<bool> {
        self.change(|gate| gate.shown = shown)
    }
}

struct AppPage(AppHandle);

impl Page for AppPage {
    fn main_window(&self) -> Option<isize> {
        foreground::handle_of(&self.0.get_webview_window(windows::MAIN)?)
    }

    fn insert(&self, id: u64, text: &str) -> bool {
        let payload = serde_json::json!({ "id": id, "text": text });
        self.0
            .emit_to(windows::MAIN, "insert-text", payload)
            .inspect_err(|error| log::warn!("inserting into the main window failed: {error}"))
            .is_ok()
    }
}

struct AppKeeper(AppHandle);

impl Keeper for AppKeeper {
    fn keep(&self, text: &str) -> bool {
        self.0
            .state::<Shell>()
            .copy(text)
            .inspect_err(|error| log::warn!("keeping a dictation in the clipboard failed: {error}"))
            .is_ok()
    }
}

struct NoHook;

impl KeyHook for NoHook {
    fn guard_start_menu(&self) {}

    fn is_held(&self, _key: Key) -> bool {
        true
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_microphone_check_runs_only_while_its_step_is_shown_in_a_visible_window() {
        let mut gate = CheckGate::default();
        assert_eq!(gate.want(true), Some(true));
        assert_eq!(gate.show(false), Some(false));
        assert_eq!(gate.show(false), None);
        assert_eq!(gate.show(true), Some(true));
        assert_eq!(gate.want(false), Some(false));
        assert_eq!(gate.show(false), None);
        assert_eq!(gate.want(true), None);
        assert_eq!(gate.show(true), Some(true));
    }
}
