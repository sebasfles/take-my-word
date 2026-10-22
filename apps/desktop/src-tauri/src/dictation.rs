use crate::activity::Busy;
use crate::api::{ApiErrorCode, ApiFailure, DictationApi, DictationMeta, PasteKeystroke};
use crate::audio::{self, AudioError, Captured};
use crate::foreground::ForegroundApp;
use crate::i18n::Message;
use crate::overlay::{Overlay, OverlayAction, OverlayState};
use crate::paste::{PasteResult, Undelivered};
use crate::rules::Keystrokes;
use crate::session::Take;

pub struct Job {
    pub take: Take,
    pub target: ForegroundApp,
    pub busy: Busy,
}

pub trait Paste {
    fn paste(
        &mut self,
        text: &str,
        target: Option<isize>,
        keystroke: PasteKeystroke,
    ) -> PasteResult;
}

pub trait Notifier {
    fn notify(&self, sentence: &[Message]);
}

pub struct Worker<A, P, O, N, K> {
    pub api: A,
    pub paste: P,
    pub overlay: O,
    pub notifier: N,
    pub keystrokes: K,
}

impl<A: DictationApi, P: Paste, O: Overlay, N: Notifier, K: Keystrokes> Worker<A, P, O, N, K> {
    pub fn handle(&mut self, job: Job) {
        let Job { take, target, busy } = job;
        match take {
            Take::TooShort | Take::Cancelled => self.overlay.set(OverlayState::Hidden),
            Take::Failed(error) => {
                log::warn!("dictation failed: {error}");
                self.overlay.set(microphone_error(&error));
            }
            Take::Recorded { captured, held } => {
                log::info!("dictating a {} ms hold", held.as_millis());
                self.dictate(&captured, target);
            }
        }
        drop(busy);
    }

    fn dictate(&mut self, captured: &Captured, target: ForegroundApp) {
        self.overlay.set(OverlayState::Processing);
        let wav = match audio::encode_wav(captured) {
            Ok(wav) => wav,
            Err(error) => {
                log::warn!("dictation failed: {error}");
                self.overlay.set(error_state(Message::Generic, None));
                return;
            }
        };
        #[cfg(debug_assertions)]
        crate::dev::dump_recording(&wav);
        let meta = DictationMeta {
            app_id: target.app_id.clone(),
            ..DictationMeta::default()
        };
        let response = match self.api.dictate(wav, &meta) {
            Ok(response) => response,
            Err(failure) => {
                log::warn!("dictation failed: {failure}");
                self.overlay.set(api_error(&failure));
                return;
            }
        };
        self.overlay.set(OverlayState::Hidden);
        if !response.has_text() {
            log::info!("dictation returned no text");
            return;
        }
        let keystroke = self.keystrokes.for_app(target.app_id.as_deref());
        log::info!(
            "pasting into {} with {keystroke:?}",
            target.app_id.as_deref().unwrap_or("an unknown app")
        );
        match self.paste.paste(&response.text, target.window, keystroke) {
            PasteResult::Pasted => log::info!("pasted a dictation"),
            PasteResult::PastedClipboardLost => {
                log::info!("pasted a dictation but could not restore the clipboard");
                self.notifier.notify(&[Message::ClipboardLost]);
            }
            PasteResult::LeftInClipboard(reason) => {
                log::info!("left a dictation in the clipboard: {reason:?}");
                self.notifier.notify(&[match reason {
                    Undelivered::FocusChanged => Message::NotPastedFocusChanged,
                    Undelivered::Elevated => Message::NotPastedElevated,
                    Undelivered::KeysHeld | Undelivered::NotRead => Message::NotPasted,
                }]);
            }
            PasteResult::Failed => self.overlay.set(error_state(Message::PasteFailed, None)),
        }
    }
}

fn error_state(message: Message, action: Option<OverlayAction>) -> OverlayState {
    OverlayState::Error { message, action }
}

fn microphone_error(error: &AudioError) -> OverlayState {
    match error {
        AudioError::PermissionDenied => error_state(
            Message::MicrophoneBlocked,
            Some(OverlayAction::MicrophoneSettings),
        ),
        AudioError::NoSignal => error_state(
            Message::MicrophoneSilent,
            Some(OverlayAction::MicrophoneSettings),
        ),
        AudioError::NoDevice => error_state(Message::MicrophoneMissing, None),
        _ => error_state(Message::MicrophoneFailed, None),
    }
}

fn api_error(failure: &ApiFailure) -> OverlayState {
    let message = match failure {
        ApiFailure::Network(_) => Message::DictationUnreachable,
        ApiFailure::SignedOut => Message::SignInToDictate,
        ApiFailure::Rejected {
            code: Some(ApiErrorCode::QuotaExceeded),
            ..
        } => Message::QuotaReached,
        ApiFailure::Rejected { status: 413, .. } => Message::TooLong,
        ApiFailure::Rejected { status: 415, .. } => Message::UnsupportedFormat,
        ApiFailure::Rejected { .. }
        | ApiFailure::InvalidRequest
        | ApiFailure::InvalidResponse(_) => Message::Generic,
    };
    error_state(message, None)
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::time::Duration;

    use super::*;
    use crate::activity::Activity;
    use crate::api::{DictationResponse, LatencyMs, Skipped};

    #[derive(Default)]
    struct World {
        activity: Activity,
        busy_while_pasting: Vec<bool>,
        overlay: Vec<OverlayState>,
        pasted: Vec<String>,
        keystrokes: Vec<PasteKeystroke>,
        notices: usize,
        sent: Vec<DictationMeta>,
    }

    type Shared = Rc<RefCell<World>>;

    struct FakeApi(Shared, Result<DictationResponse, fn() -> ApiFailure>);

    impl DictationApi for FakeApi {
        fn dictate(
            &self,
            wav: Vec<u8>,
            meta: &DictationMeta,
        ) -> Result<DictationResponse, ApiFailure> {
            assert!(wav.starts_with(b"RIFF"));
            self.0.borrow_mut().sent.push(meta.clone());
            self.1.clone().map_err(|failure| failure())
        }
    }

    struct FakePaste(Shared, PasteResult);

    impl Paste for FakePaste {
        fn paste(
            &mut self,
            text: &str,
            _target: Option<isize>,
            keystroke: PasteKeystroke,
        ) -> PasteResult {
            let mut world = self.0.borrow_mut();
            let busy = !world.activity.is_idle();
            world.busy_while_pasting.push(busy);
            world.pasted.push(text.into());
            world.keystrokes.push(keystroke);
            self.1
        }
    }

    struct FakeOverlay(Shared);

    impl Overlay for FakeOverlay {
        fn set(&self, state: OverlayState) {
            self.0.borrow_mut().overlay.push(state);
        }
    }

    struct Rules;

    impl Keystrokes for Rules {
        fn for_app(&self, app_id: Option<&str>) -> PasteKeystroke {
            match app_id {
                Some("notepad.exe") => PasteKeystroke::ShiftInsert,
                _ => PasteKeystroke::CtrlV,
            }
        }
    }

    struct FakeNotifier(Shared);

    impl Notifier for FakeNotifier {
        fn notify(&self, _sentence: &[Message]) {
            self.0.borrow_mut().notices += 1;
        }
    }

    fn response(text: &str, skipped: Option<Skipped>) -> DictationResponse {
        DictationResponse {
            raw: text.into(),
            text: text.into(),
            skipped,
            latency_ms: LatencyMs {
                total: 1,
                ..LatencyMs::default()
            },
            ..DictationResponse::default()
        }
    }

    fn run(
        take: Take,
        answer: Result<DictationResponse, fn() -> ApiFailure>,
        pasting: PasteResult,
    ) -> World {
        let world = Rc::new(RefCell::new(World::default()));
        let busy = world.borrow().activity.start();
        let mut worker = Worker {
            api: FakeApi(Rc::clone(&world), answer),
            paste: FakePaste(Rc::clone(&world), pasting),
            overlay: FakeOverlay(Rc::clone(&world)),
            notifier: FakeNotifier(Rc::clone(&world)),
            keystrokes: Rules,
        };
        worker.handle(Job {
            take,
            target: ForegroundApp {
                window: Some(7),
                app_id: Some("notepad.exe".into()),
                elevated: false,
            },
            busy,
        });
        assert!(world.borrow().activity.is_idle());
        drop(worker);
        Rc::try_unwrap(world).ok().unwrap().into_inner()
    }

    fn recorded() -> Take {
        Take::Recorded {
            captured: Captured {
                samples: vec![0.1; 48_000],
                channels: 1,
                sample_rate: 48_000,
            },
            held: Duration::from_secs(1),
        }
    }

    fn kinds(world: &World) -> Vec<&'static str> {
        world
            .overlay
            .iter()
            .map(|state| match state {
                OverlayState::Hidden => "hidden",
                OverlayState::Listening => "listening",
                OverlayState::Processing => "processing",
                OverlayState::Error { .. } => "error",
            })
            .collect()
    }

    #[test]
    fn text_is_pasted_after_the_overlay_closes_and_the_api_picks_the_language() {
        let world = run(recorded(), Ok(response("Hola.", None)), PasteResult::Pasted);
        assert_eq!(kinds(&world), vec!["processing", "hidden"]);
        assert_eq!(world.pasted, vec!["Hola."]);
        assert_eq!(world.busy_while_pasting, vec![true]);
        assert_eq!(world.keystrokes, vec![PasteKeystroke::ShiftInsert]);
        assert_eq!(world.sent[0].locale, None);
        assert_eq!(world.sent[0].app_id.as_deref(), Some("notepad.exe"));
        assert_eq!(world.notices, 0);
    }

    #[test]
    fn silence_or_empty_text_pastes_nothing_and_closes_the_overlay() {
        for answer in [response("", Some(Skipped::Silence)), response("  ", None)] {
            let world = run(recorded(), Ok(answer), PasteResult::Pasted);
            assert_eq!(kinds(&world), vec!["processing", "hidden"]);
            assert!(world.pasted.is_empty());
        }
    }

    #[test]
    fn api_failures_show_their_message_and_paste_nothing() {
        type Failure = fn() -> ApiFailure;
        let failures: [(Failure, Message); 7] = [
            (
                || ApiFailure::Network("refused".into()),
                Message::DictationUnreachable,
            ),
            (|| ApiFailure::SignedOut, Message::SignInToDictate),
            (
                || ApiFailure::Rejected {
                    status: 429,
                    code: Some(ApiErrorCode::QuotaExceeded),
                },
                Message::QuotaReached,
            ),
            (
                || ApiFailure::Rejected {
                    status: 413,
                    code: None,
                },
                Message::TooLong,
            ),
            (
                || ApiFailure::Rejected {
                    status: 415,
                    code: Some(ApiErrorCode::UnsupportedMediaType),
                },
                Message::UnsupportedFormat,
            ),
            (
                || ApiFailure::Rejected {
                    status: 429,
                    code: None,
                },
                Message::Generic,
            ),
            (
                || ApiFailure::InvalidResponse("garbage".into()),
                Message::Generic,
            ),
        ];
        for (failure, message) in failures {
            let world = run(recorded(), Err(failure), PasteResult::Pasted);
            assert_eq!(kinds(&world), vec!["processing", "error"]);
            assert_eq!(world.overlay[1], error_state(message, None));
            assert!(world.pasted.is_empty());
        }
    }

    #[test]
    fn text_left_in_the_clipboard_is_announced() {
        for reason in [
            Undelivered::FocusChanged,
            Undelivered::Elevated,
            Undelivered::NotRead,
        ] {
            let world = run(
                recorded(),
                Ok(response("Hola.", None)),
                PasteResult::LeftInClipboard(reason),
            );
            assert_eq!(world.notices, 1);
        }
    }

    #[test]
    fn a_clipboard_that_could_not_be_restored_is_announced() {
        let world = run(
            recorded(),
            Ok(response("Hola.", None)),
            PasteResult::PastedClipboardLost,
        );
        assert_eq!(world.pasted, vec!["Hola."]);
        assert_eq!(world.notices, 1);
    }

    #[test]
    fn a_denied_microphone_offers_the_privacy_settings() {
        let world = run(
            Take::Failed(AudioError::PermissionDenied),
            Ok(response("x", None)),
            PasteResult::Pasted,
        );
        assert!(matches!(
            world.overlay.as_slice(),
            [OverlayState::Error {
                action: Some(OverlayAction::MicrophoneSettings),
                ..
            }]
        ));
        assert!(world.sent.is_empty());
    }

    #[test]
    fn a_silent_microphone_also_offers_the_privacy_settings() {
        let world = run(
            Take::Failed(AudioError::NoSignal),
            Ok(response("x", None)),
            PasteResult::Pasted,
        );
        assert!(matches!(
            world.overlay.as_slice(),
            [OverlayState::Error {
                action: Some(OverlayAction::MicrophoneSettings),
                ..
            }]
        ));
    }

    #[test]
    fn discarded_takes_just_close_the_overlay() {
        for take in [Take::TooShort, Take::Cancelled] {
            let world = run(take, Ok(response("x", None)), PasteResult::Pasted);
            assert_eq!(kinds(&world), vec!["hidden"]);
            assert!(world.sent.is_empty());
        }
    }
}
