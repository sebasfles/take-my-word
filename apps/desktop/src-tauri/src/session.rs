use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use crate::audio::{self, AudioError, Capture, Captured, MAX_RECORDING, MIN_RECORDING};
use crate::hotkey::{ChordEvent, ChordTracker, Hotkey, Key, KeyEvent};

pub enum Input {
    Key(KeyEvent),
}

#[derive(Debug)]
pub enum Outcome {
    Recorded { wav: Vec<u8>, held: Duration },
    TooShort,
    Cancelled,
    Failed(AudioError),
}

pub trait Effects {
    fn is_held(&self, key: Key) -> bool;
    fn guard_start_menu(&mut self);
    fn listening(&mut self);
    fn finished(&mut self, outcome: Outcome);
}

pub struct Session<C, E> {
    hotkey: Hotkey,
    chord: ChordTracker,
    capture: C,
    effects: E,
    recording_since: Option<Instant>,
}

impl<C: Capture, E: Effects> Session<C, E> {
    pub fn new(hotkey: Hotkey, capture: C, effects: E) -> Self {
        Self {
            hotkey,
            chord: ChordTracker::default(),
            capture,
            effects,
            recording_since: None,
        }
    }

    pub fn run(mut self, inbox: Receiver<Input>) {
        loop {
            let next = match self.deadline() {
                Some(deadline) => {
                    match inbox.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                        Ok(input) => Some(input),
                        Err(RecvTimeoutError::Timeout) => None,
                        Err(RecvTimeoutError::Disconnected) => return,
                    }
                }
                None => match inbox.recv() {
                    Ok(input) => Some(input),
                    Err(_) => return,
                },
            };
            let now = Instant::now();
            match next {
                Some(input) => self.handle(input, now),
                None => self.on_deadline(now),
            }
        }
    }

    fn deadline(&self) -> Option<Instant> {
        self.recording_since.map(|since| since + MAX_RECORDING)
    }

    fn handle(&mut self, input: Input, now: Instant) {
        match input {
            Input::Key(event) => {
                if event.down {
                    let effects = &self.effects;
                    self.chord
                        .forget_released(|key| key == event.key || effects.is_held(key));
                }
                match self.chord.on_key(&self.hotkey, event) {
                    Some(ChordEvent::Pressed) => self.begin(now),
                    Some(ChordEvent::Released) => self.end(now),
                    Some(ChordEvent::Cancelled) => self.cancel(),
                    None => {}
                }
            }
        }
    }

    fn on_deadline(&mut self, now: Instant) {
        if self.deadline().is_some_and(|deadline| now >= deadline) {
            self.end(now);
        }
    }

    fn begin(&mut self, now: Instant) {
        if self.hotkey.uses_meta() {
            self.effects.guard_start_menu();
        }
        self.effects.listening();
        self.capture.start();
        self.recording_since = Some(now);
    }

    fn end(&mut self, now: Instant) {
        let Some(since) = self.recording_since.take() else {
            return;
        };
        let held = now.duration_since(since);
        let captured = self.capture.stop();
        self.effects.finished(outcome(held, captured));
    }

    fn cancel(&mut self) {
        if self.recording_since.take().is_some() {
            let _ = self.capture.stop();
            self.effects.finished(Outcome::Cancelled);
        }
    }
}

fn outcome(held: Duration, captured: Result<Captured, AudioError>) -> Outcome {
    if held < MIN_RECORDING {
        return Outcome::TooShort;
    }
    let captured = match captured {
        Ok(captured) => captured,
        Err(error) => return Outcome::Failed(error),
    };
    if captured.duration() < MIN_RECORDING {
        return Outcome::TooShort;
    }
    match audio::encode_wav(&captured) {
        Ok(wav) => Outcome::Recorded { wav, held },
        Err(error) => Outcome::Failed(error),
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;

    use super::*;
    use crate::hotkey::{HotkeyKey, Key, Side};

    const CTRL: Key = Key::Ctrl(Side::Left);
    const WIN: Key = Key::Meta(Side::Left);
    const SAMPLE_RATE: u32 = 48_000;

    #[derive(Default)]
    struct Log {
        missed_releases: Vec<Key>,
        events: Vec<String>,
        outcomes: Vec<Outcome>,
        mic_open: bool,
    }

    struct FakeMic {
        log: Rc<RefCell<Log>>,
        audio: Result<Duration, ()>,
    }

    impl Capture for FakeMic {
        fn start(&mut self) {
            let mut log = self.log.borrow_mut();
            log.mic_open = true;
            log.events.push("start".into());
        }

        fn stop(&mut self) -> Result<Captured, AudioError> {
            self.log.borrow_mut().mic_open = false;
            let length = self.audio.map_err(|()| AudioError::PermissionDenied)?;
            Ok(Captured {
                samples: vec![0.1; (length.as_secs_f64() * f64::from(SAMPLE_RATE)) as usize],
                channels: 1,
                sample_rate: SAMPLE_RATE,
            })
        }
    }

    struct FakeEffects(Rc<RefCell<Log>>);

    impl Effects for FakeEffects {
        fn is_held(&self, key: Key) -> bool {
            !self.0.borrow().missed_releases.contains(&key)
        }

        fn guard_start_menu(&mut self) {
            self.0.borrow_mut().events.push("guard".into());
        }

        fn listening(&mut self) {
            self.0.borrow_mut().events.push("listening".into());
        }

        fn finished(&mut self, outcome: Outcome) {
            self.0.borrow_mut().outcomes.push(outcome);
        }
    }

    struct Harness {
        session: Session<FakeMic, FakeEffects>,
        log: Rc<RefCell<Log>>,
        t0: Instant,
    }

    impl Harness {
        fn new(hotkey: Hotkey, audio: Result<Duration, ()>) -> Self {
            let log = Rc::new(RefCell::new(Log::default()));
            let mic = FakeMic {
                log: Rc::clone(&log),
                audio,
            };
            let session = Session::new(hotkey, mic, FakeEffects(Rc::clone(&log)));
            Self {
                session,
                log,
                t0: Instant::now(),
            }
        }

        fn key(&mut self, key: Key, down: bool, at_ms: u64) {
            let now = self.t0 + Duration::from_millis(at_ms);
            self.session.handle(Input::Key(KeyEvent { key, down }), now);
        }

        fn hold_chord(&mut self, press_ms: u64, release_ms: u64) {
            self.key(CTRL, true, press_ms);
            self.key(WIN, true, press_ms);
            self.key(WIN, false, release_ms);
            self.key(CTRL, false, release_ms);
        }

        fn outcomes(&self) -> Vec<String> {
            self.log
                .borrow()
                .outcomes
                .iter()
                .map(|outcome| match outcome {
                    Outcome::Recorded { held, .. } => format!("recorded {}ms", held.as_millis()),
                    Outcome::TooShort => "too short".into(),
                    Outcome::Cancelled => "cancelled".into(),
                    Outcome::Failed(error) => format!("failed: {error}"),
                })
                .collect()
        }
    }

    #[test]
    fn a_hold_records_the_wav_and_guards_the_start_menu_first() {
        let mut harness = Harness::new(Hotkey::default(), Ok(Duration::from_millis(1950)));
        harness.hold_chord(0, 2000);
        assert_eq!(harness.outcomes(), vec!["recorded 2000ms"]);
        assert_eq!(
            harness.log.borrow().events,
            vec!["guard", "listening", "start"]
        );
        assert!(!harness.log.borrow().mic_open);
        let Outcome::Recorded { wav, .. } = &harness.log.borrow().outcomes[0] else {
            unreachable!()
        };
        let reader = hound::WavReader::new(std::io::Cursor::new(wav)).unwrap();
        assert_eq!(reader.spec().sample_rate, 16_000);
        assert_eq!(reader.duration(), 1950 * 16);
    }

    #[test]
    fn a_press_under_half_a_second_is_discarded_and_releases_the_microphone() {
        let mut harness = Harness::new(Hotkey::default(), Ok(Duration::from_millis(400)));
        harness.hold_chord(0, 450);
        assert_eq!(harness.outcomes(), vec!["too short"]);
        assert!(!harness.log.borrow().mic_open);
    }

    #[test]
    fn audio_shorter_than_half_a_second_is_discarded_even_after_a_long_enough_hold() {
        let mut harness = Harness::new(Hotkey::default(), Ok(Duration::from_millis(420)));
        harness.hold_chord(0, 600);
        assert_eq!(harness.outcomes(), vec!["too short"]);
    }

    #[test]
    fn another_key_during_the_hold_cancels_the_dictation() {
        let mut harness = Harness::new(Hotkey::default(), Ok(Duration::from_secs(3)));
        harness.key(CTRL, true, 0);
        harness.key(WIN, true, 0);
        harness.key(Key::Other(0x27), true, 1500);
        harness.key(WIN, false, 1600);
        assert_eq!(harness.outcomes(), vec!["cancelled"]);
        assert!(!harness.log.borrow().mic_open);
    }

    #[test]
    fn holding_past_two_minutes_stops_and_sends_once() {
        let mut harness = Harness::new(Hotkey::default(), Ok(MAX_RECORDING));
        harness.key(CTRL, true, 0);
        harness.key(WIN, true, 0);
        assert_eq!(harness.session.deadline(), Some(harness.t0 + MAX_RECORDING));
        harness
            .session
            .on_deadline(harness.t0 + MAX_RECORDING - Duration::from_millis(1));
        assert!(harness.outcomes().is_empty());
        harness.session.on_deadline(harness.t0 + MAX_RECORDING);
        assert_eq!(harness.outcomes(), vec!["recorded 120000ms"]);
        harness.key(WIN, false, 130_000);
        assert_eq!(harness.outcomes().len(), 1);
        assert_eq!(harness.session.deadline(), None);
    }

    #[test]
    fn keys_released_while_the_screen_was_locked_do_not_block_the_next_dictation() {
        let lock_key = Key::Other(0x4C);
        let mut harness = Harness::new(Hotkey::default(), Ok(Duration::from_secs(1)));
        harness.key(WIN, true, 0);
        harness.key(lock_key, true, 10);
        harness.log.borrow_mut().missed_releases = vec![WIN, lock_key];
        harness.hold_chord(60_000, 61_000);
        assert_eq!(harness.outcomes(), vec!["recorded 1000ms"]);
    }

    #[test]
    fn microphone_errors_surface_as_failures() {
        let mut harness = Harness::new(Hotkey::default(), Err(()));
        harness.hold_chord(0, 1000);
        assert_eq!(
            harness.outcomes(),
            vec!["failed: the system denied access to the microphone"]
        );
    }

    #[test]
    fn hotkeys_without_win_never_inject_the_start_menu_guard() {
        let hotkey = Hotkey::new(vec![HotkeyKey::Ctrl, HotkeyKey::Shift]).unwrap();
        let mut harness = Harness::new(hotkey, Ok(Duration::from_secs(1)));
        harness.key(CTRL, true, 0);
        harness.key(Key::Shift(Side::Right), true, 0);
        harness.key(CTRL, false, 1000);
        assert_eq!(harness.log.borrow().events, vec!["listening", "start"]);
        assert_eq!(harness.outcomes(), vec!["recorded 1000ms"]);
    }
}
