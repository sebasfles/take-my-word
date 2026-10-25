use std::borrow::Cow;
use std::time::{Duration, Instant};

use crate::activity::Busy;
use crate::api::{
    ApiErrorCode, ApiFailure, DictationApi, DictationMeta, DictationResponse, PasteKeystroke,
};
use crate::audio::{self, AudioError, Captured};
use crate::foreground::ForegroundApp;
use crate::i18n::Message;
use crate::overlay::{Overlay, OverlayAction, OverlayState};
use crate::paste::{PasteResult, Undelivered};
use crate::rules::Keystrokes;
use crate::segments::Finished;
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
    pub grace: Duration,
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
            Take::Recorded {
                captured,
                held,
                segments,
                released,
            } => {
                log::info!("dictating a {} ms hold", held.as_millis());
                let finished = segments
                    .as_ref()
                    .map(|segments| segments.finish(self.grace))
                    .unwrap_or_default();
                let report = self.dictate(&captured, &finished, target);
                let answered = report.answered.map_or_else(
                    || "no answer".to_owned(),
                    |at| {
                        format!(
                            "answered {} ms",
                            at.saturating_duration_since(released).as_millis()
                        )
                    },
                );
                log::info!(
                    "take: {} ms of audio, {} segments sent, {} used{}{}, {answered} and {} {} ms after release",
                    captured.duration().as_millis(),
                    finished.sent,
                    finished.earlier.len(),
                    if finished.late { ", one late" } else { "" },
                    if report.resent { ", resent whole" } else { "" },
                    report.outcome,
                    released.elapsed().as_millis(),
                );
            }
        }
        drop(busy);
    }

    fn send(
        &self,
        captured: &Captured,
        finished: &Finished,
        target: &ForegroundApp,
    ) -> Result<DictationResponse, Unanswered> {
        let audio = if finished.earlier.is_empty() {
            Cow::Borrowed(captured)
        } else {
            Cow::Owned(captured.between_levels(finished.covered, usize::MAX))
        };
        let wav = audio::encode_wav(&audio).map_err(Unanswered::Encode)?;
        #[cfg(debug_assertions)]
        crate::dev::dump_recording(&wav);
        let meta = DictationMeta {
            app_id: target.app_id.clone(),
            language: finished.language.filter(|_| !finished.earlier.is_empty()),
            ..DictationMeta::default()
        };
        self.api
            .dictate(wav, &meta, &finished.earlier)
            .map_err(Unanswered::Api)
    }

    fn dictate(
        &mut self,
        captured: &Captured,
        finished: &Finished,
        target: ForegroundApp,
    ) -> Report {
        self.overlay.set(OverlayState::Processing);
        let mut report = Report {
            outcome: "failed",
            answered: None,
            resent: false,
        };
        let answer = match self.send(captured, finished, &target) {
            Err(Unanswered::Api(ApiFailure::Rejected { status: 400, code }))
                if !finished.earlier.is_empty() =>
            {
                log::warn!(
                    "the final with segments was refused ({code:?}), sending the whole take"
                );
                report.resent = true;
                self.send(captured, &Finished::default(), &target)
            }
            other => other,
        };
        let response = match answer {
            Ok(response) => response,
            Err(Unanswered::Encode(error)) => {
                log::warn!("dictation failed: {error}");
                self.overlay.set(error_state(Message::Generic, None));
                return report;
            }
            Err(Unanswered::Api(failure)) => {
                log::warn!("dictation failed: {failure}");
                self.overlay.set(api_error(&failure));
                return report;
            }
        };
        report.answered = Some(Instant::now());
        report.outcome = self.deliver(&response, &target);
        report
    }

    fn deliver(&mut self, response: &DictationResponse, target: &ForegroundApp) -> &'static str {
        self.overlay.set(OverlayState::Hidden);
        if !response.has_text() {
            log::info!("dictation returned no text");
            return "empty";
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
                return "left in the clipboard";
            }
            PasteResult::Failed => {
                self.overlay.set(error_state(Message::PasteFailed, None));
                return "failed";
            }
        }
        "pasted"
    }
}

enum Unanswered {
    Encode(AudioError),
    Api(ApiFailure),
}

struct Report {
    outcome: &'static str,
    answered: Option<Instant>,
    resent: bool,
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
    use std::sync::mpsc;

    use super::*;
    use crate::activity::Activity;
    use crate::api::{DictationResponse, EarlierSegment, LatencyMs, Skipped};
    use crate::locale::Language;
    use crate::segments::{Support, TakeSegments};

    #[derive(Default)]
    struct World {
        activity: Activity,
        busy_while_pasting: Vec<bool>,
        overlay: Vec<OverlayState>,
        pasted: Vec<String>,
        keystrokes: Vec<PasteKeystroke>,
        notices: usize,
        sent: Vec<DictationMeta>,
        earlier: Vec<Vec<EarlierSegment>>,
        seconds: Vec<f64>,
    }

    type Shared = Rc<RefCell<World>>;

    struct FakeApi(Shared, Result<DictationResponse, fn() -> ApiFailure>);

    impl DictationApi for FakeApi {
        fn dictate(
            &self,
            wav: Vec<u8>,
            meta: &DictationMeta,
            earlier: &[EarlierSegment],
        ) -> Result<DictationResponse, ApiFailure> {
            assert!(wav.starts_with(b"RIFF"));
            let mut world = self.0.borrow_mut();
            world.sent.push(meta.clone());
            world.earlier.push(earlier.to_vec());
            world.seconds.push((wav.len() - 44) as f64 / 32_000.0);
            if earlier.iter().any(|segment| segment.receipt == "expired") {
                return Err(ApiFailure::Rejected {
                    status: 400,
                    code: Some(ApiErrorCode::BadRequest),
                });
            }
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
            grace: Duration::from_millis(20),
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
        segmented(1, None)
    }

    fn segmented(seconds: usize, segments: Option<TakeSegments>) -> Take {
        Take::Recorded {
            captured: Captured {
                samples: vec![0.1; 48_000 * seconds],
                channels: 1,
                sample_rate: 48_000,
            },
            held: Duration::from_secs(seconds as u64),
            segments,
            released: Instant::now(),
        }
    }

    fn segment(text: &str) -> EarlierSegment {
        EarlierSegment {
            text: text.into(),
            receipt: format!("receipt-{text}"),
        }
    }

    fn kinds(world: &World) -> Vec<&'static str> {
        world
            .overlay
            .iter()
            .map(|state| match state {
                OverlayState::Hidden => "hidden",
                OverlayState::Listening => "listening",
                OverlayState::HandsFree => "hands-free",
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
    fn a_segmented_take_sends_the_earlier_texts_with_only_the_audio_after_them() {
        let (jobs, _inbox) = mpsc::channel();
        let segments = TakeSegments::answered(
            jobs,
            Support::default(),
            vec![segment("uno"), segment("dos")],
            2_100,
            Some(Language::Es),
            false,
        );
        let world = run(
            segmented(25, Some(segments)),
            Ok(response("Uno dos tres.", None)),
            PasteResult::Pasted,
        );
        assert_eq!(world.pasted, vec!["Uno dos tres."]);
        assert_eq!(world.earlier, vec![vec![segment("uno"), segment("dos")]]);
        assert_eq!(world.sent[0].language, Some(Language::Es));
        assert!(
            (world.seconds[0] - 4.0).abs() < 0.05,
            "{}",
            world.seconds[0]
        );
    }

    #[test]
    fn a_take_whose_segments_all_failed_goes_whole_exactly_as_before() {
        let (jobs, _inbox) = mpsc::channel();
        let segments = TakeSegments::answered(jobs, Support::default(), vec![], 0, None, false);
        let world = run(
            segmented(25, Some(segments)),
            Ok(response("Todo.", None)),
            PasteResult::Pasted,
        );
        assert_eq!(world.earlier, vec![Vec::<EarlierSegment>::new()]);
        assert_eq!(
            world.sent[0],
            DictationMeta {
                app_id: Some("notepad.exe".into()),
                ..DictationMeta::default()
            }
        );
        assert!((world.seconds[0] - 25.0).abs() < 0.05);
    }

    #[test]
    fn a_segment_still_in_flight_at_release_goes_as_audio_inside_the_final() {
        let (jobs, _inbox) = mpsc::channel();
        let segments = TakeSegments::answered(
            jobs,
            Support::default(),
            vec![segment("uno")],
            1_000,
            Some(Language::En),
            true,
        );
        let world = run(
            segmented(25, Some(segments)),
            Ok(response("Uno y el resto.", None)),
            PasteResult::Pasted,
        );
        assert_eq!(world.earlier, vec![vec![segment("uno")]]);
        assert!((world.seconds[0] - 15.0).abs() < 0.05);
        assert_eq!(world.pasted.len(), 1);
    }

    #[test]
    fn a_final_refused_for_its_segments_is_sent_again_as_the_whole_take() {
        let (jobs, _inbox) = mpsc::channel();
        let expired = EarlierSegment {
            text: "uno".into(),
            receipt: "expired".into(),
        };
        let segments = TakeSegments::answered(
            jobs,
            Support::default(),
            vec![expired],
            1_000,
            Some(Language::Es),
            false,
        );
        let world = run(
            segmented(25, Some(segments)),
            Ok(response("Todo.", None)),
            PasteResult::Pasted,
        );
        assert_eq!(world.earlier.len(), 2);
        assert!(world.earlier[1].is_empty());
        assert_eq!(world.sent[1].language, None);
        assert!((world.seconds[0] - 15.0).abs() < 0.05);
        assert!((world.seconds[1] - 25.0).abs() < 0.05);
        assert_eq!(world.pasted, vec!["Todo."]);
        assert_eq!(kinds(&world), vec!["processing", "hidden"]);
    }

    #[test]
    fn a_failed_final_after_segments_still_shows_its_error() {
        let (jobs, _inbox) = mpsc::channel();
        let segments = TakeSegments::answered(
            jobs,
            Support::default(),
            vec![segment("uno")],
            1_000,
            None,
            false,
        );
        let world = run(
            segmented(12, Some(segments)),
            Err(|| ApiFailure::Network("refused".into())),
            PasteResult::Pasted,
        );
        assert_eq!(kinds(&world), vec!["processing", "error"]);
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
