use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use crate::audio::{AudioError, Capture, Captured, MAX_RECORDING, MIN_RECORDING};

const RELEASE_CHECK: Duration = Duration::from_millis(100);
use crate::hotkey::{ChordEvent, Command, Gesture};

pub enum Input {
    Chord { event: ChordEvent, at: Instant },
    Stop { at: Instant },
    MicrophoneCheck(bool),
}

#[derive(Debug)]
pub enum Take {
    Recorded { captured: Captured, held: Duration },
    TooShort,
    Cancelled,
    Failed(AudioError),
}

pub trait Sink {
    fn may_record(&mut self) -> bool;
    fn listening(&mut self);
    fn hands_free(&mut self);
    fn chord_released(&mut self) -> bool;
    fn finished(&mut self, take: Take);
}

pub struct Session<C, S> {
    capture: C,
    sink: S,
    gesture: Gesture,
    recording_since: Option<Instant>,
    release_check: Option<Instant>,
    checking: bool,
}

impl<C: Capture, S: Sink> Session<C, S> {
    pub fn new(capture: C, sink: S) -> Self {
        Self {
            capture,
            sink,
            gesture: Gesture::default(),
            recording_since: None,
            release_check: None,
            checking: false,
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
            match next {
                Some(input) => self.handle(input),
                None => self.on_deadline(Instant::now()),
            }
        }
    }

    fn deadline(&self) -> Option<Instant> {
        let cap = self.recording_since.map(|since| since + MAX_RECORDING);
        [cap, self.gesture.deadline(), self.release_check]
            .into_iter()
            .flatten()
            .min()
    }

    fn handle(&mut self, input: Input) {
        match input {
            Input::Chord { event, at } => self.chord(event, at),
            Input::Stop { at } => {
                if self.gesture.is_hands_free() {
                    log::info!("hotkey: hands-free stopped from the overlay");
                    self.gesture.reset();
                    self.release_check = None;
                    self.end(at);
                }
            }
            Input::MicrophoneCheck(on) => {
                self.checking = on;
                if self.recording_since.is_none() {
                    self.capture.monitor(on);
                }
            }
        }
    }

    fn chord(&mut self, event: ChordEvent, at: Instant) {
        for command in self.gesture.on_chord(event, at) {
            self.apply(command, at);
        }
        self.release_check = self.gesture.holds_keys().then(|| at + RELEASE_CHECK);
    }

    fn apply(&mut self, command: Command, at: Instant) {
        match command {
            Command::Start => self.begin(at),
            Command::HandsFree => self.sink.hands_free(),
            Command::Stop => self.end(at),
            Command::Discard => self.finish(Take::TooShort),
            Command::Cancel => self.finish(Take::Cancelled),
        }
    }

    fn on_deadline(&mut self, now: Instant) {
        if let Some(command) = self.gesture.on_deadline(now) {
            self.apply(command, now);
        }
        if self.release_check.is_some_and(|check| now >= check) {
            self.release_check = None;
            if self.sink.chord_released() {
                log::info!("hotkey: the chord keys read up with no key-up seen, released");
                self.chord(ChordEvent::Released, now);
            } else if self.gesture.holds_keys() {
                self.release_check = Some(now + RELEASE_CHECK);
            }
        }
        let capped = self
            .recording_since
            .is_some_and(|since| now >= since + MAX_RECORDING);
        if capped {
            self.gesture.reset();
            self.release_check = None;
            self.end(now);
        }
    }

    fn begin(&mut self, at: Instant) {
        if self.recording_since.is_some() || !self.sink.may_record() {
            self.gesture.reset();
            return;
        }
        self.sink.listening();
        self.capture.start();
        self.recording_since = Some(at);
    }

    fn end(&mut self, at: Instant) {
        let Some(since) = self.recording_since.take() else {
            return;
        };
        let held = at.saturating_duration_since(since).min(MAX_RECORDING);
        let captured = self.capture.stop();
        self.resume_check();
        self.sink.finished(take(held, captured));
    }

    fn finish(&mut self, take: Take) {
        if self.recording_since.take().is_some() {
            let _ = self.capture.stop();
            self.resume_check();
            self.sink.finished(take);
        }
    }

    fn resume_check(&mut self) {
        if self.checking {
            self.capture.monitor(true);
        }
    }
}

fn take(held: Duration, captured: Result<Captured, AudioError>) -> Take {
    if held < MIN_RECORDING {
        return Take::TooShort;
    }
    match captured {
        Ok(captured) if captured.duration() < MIN_RECORDING => Take::TooShort,
        Ok(captured) if captured.is_digital_silence() => Take::Failed(AudioError::NoSignal),
        Ok(captured) => Take::Recorded { captured, held },
        Err(error) => Take::Failed(error),
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::sync::mpsc;

    use super::*;

    const SAMPLE_RATE: u32 = 48_000;

    #[derive(Default)]
    struct Log {
        events: Vec<String>,
        takes: Vec<Take>,
        mic_open: bool,
        zeros: bool,
        signed_out: bool,
        keys_up: bool,
    }

    struct FakeMic {
        log: Rc<RefCell<Log>>,
        audio: Result<Duration, ()>,
        stop_takes: Duration,
    }

    impl Capture for FakeMic {
        fn start(&mut self) {
            let mut log = self.log.borrow_mut();
            log.mic_open = true;
            log.events.push("start".into());
        }

        fn monitor(&mut self, on: bool) {
            let event = if on { "monitor on" } else { "monitor off" };
            self.log.borrow_mut().events.push(event.into());
        }

        fn stop(&mut self) -> Result<Captured, AudioError> {
            std::thread::sleep(self.stop_takes);
            self.log.borrow_mut().mic_open = false;
            let length = self.audio.map_err(|()| AudioError::PermissionDenied)?;
            let level = if self.log.borrow().zeros { 0.0 } else { 0.1 };
            Ok(Captured {
                samples: vec![level; (length.as_secs_f64() * f64::from(SAMPLE_RATE)) as usize],
                channels: 1,
                sample_rate: SAMPLE_RATE,
            })
        }
    }

    struct FakeSink(Rc<RefCell<Log>>);

    impl Sink for FakeSink {
        fn may_record(&mut self) -> bool {
            let mut log = self.0.borrow_mut();
            log.events.push("may record".into());
            !log.signed_out
        }

        fn listening(&mut self) {
            self.0.borrow_mut().events.push("listening".into());
        }

        fn hands_free(&mut self) {
            self.0.borrow_mut().events.push("hands-free".into());
        }

        fn chord_released(&mut self) -> bool {
            self.0.borrow().keys_up
        }

        fn finished(&mut self, take: Take) {
            self.0.borrow_mut().takes.push(take);
        }
    }

    struct Harness {
        session: Session<FakeMic, FakeSink>,
        log: Rc<RefCell<Log>>,
        t0: Instant,
    }

    impl Harness {
        fn new(audio: Result<Duration, ()>, stop_takes: Duration) -> Self {
            let log = Rc::new(RefCell::new(Log::default()));
            let mic = FakeMic {
                log: Rc::clone(&log),
                audio,
                stop_takes,
            };
            Self {
                session: Session::new(mic, FakeSink(Rc::clone(&log))),
                log,
                t0: Instant::now(),
            }
        }

        fn chord(&self, event: ChordEvent, at_ms: u64) -> Input {
            Input::Chord {
                event,
                at: self.t0 + Duration::from_millis(at_ms),
            }
        }

        fn send(&mut self, event: ChordEvent, at_ms: u64) {
            let input = self.chord(event, at_ms);
            self.session.handle(input);
        }

        fn hold(&mut self, press_ms: u64, release_ms: u64) {
            self.send(ChordEvent::Pressed, press_ms);
            self.send(ChordEvent::Released, release_ms);
        }

        fn tick(&mut self, at_ms: u64) {
            let at = self.t0 + Duration::from_millis(at_ms);
            self.session.on_deadline(at);
        }

        fn double_tap(&mut self) {
            self.hold(0, 150);
            self.hold(350, 480);
        }

        fn events(&self) -> Vec<String> {
            self.log.borrow().events.clone()
        }

        fn takes(&self) -> Vec<String> {
            describe(&self.log)
        }
    }

    fn describe(log: &Rc<RefCell<Log>>) -> Vec<String> {
        log.borrow()
            .takes
            .iter()
            .map(|take| match take {
                Take::Recorded { held, captured } => format!(
                    "recorded {}ms of {}ms",
                    held.as_millis(),
                    captured.duration().as_millis()
                ),
                Take::TooShort => "too short".into(),
                Take::Cancelled => "cancelled".into(),
                Take::Failed(error) => format!("failed: {error}"),
            })
            .collect()
    }

    #[test]
    fn a_hold_opens_the_microphone_and_hands_over_the_capture() {
        let mut harness = Harness::new(Ok(Duration::from_millis(1950)), Duration::ZERO);
        harness.hold(0, 2000);
        assert_eq!(harness.takes(), vec!["recorded 2000ms of 1950ms"]);
        assert_eq!(
            harness.log.borrow().events,
            vec!["may record", "listening", "start"]
        );
        assert!(!harness.log.borrow().mic_open);
    }

    #[test]
    fn a_hold_the_sink_refuses_never_opens_the_microphone() {
        let mut harness = Harness::new(Ok(Duration::from_millis(1950)), Duration::ZERO);
        harness.log.borrow_mut().signed_out = true;
        harness.hold(0, 2000);
        assert!(harness.takes().is_empty());
        assert_eq!(harness.log.borrow().events, vec!["may record"]);
        harness.log.borrow_mut().signed_out = false;
        harness.hold(3000, 5000);
        assert_eq!(harness.takes(), vec!["recorded 2000ms of 1950ms"]);
    }

    #[test]
    fn chords_queued_behind_a_busy_session_still_record_with_their_own_timing() {
        let harness = Harness::new(Ok(Duration::from_secs(1)), Duration::from_millis(300));
        let (inbox, session_inbox) = mpsc::channel();
        for (event, at_ms) in [
            (ChordEvent::Pressed, 0),
            (ChordEvent::Released, 1000),
            (ChordEvent::Pressed, 1050),
            (ChordEvent::Released, 2100),
        ] {
            inbox.send(harness.chord(event, at_ms)).unwrap();
        }
        drop(inbox);
        let log = Rc::clone(&harness.log);
        harness.session.run(session_inbox);
        assert_eq!(
            describe(&log),
            vec!["recorded 1000ms of 1000ms", "recorded 1050ms of 1000ms"]
        );
    }

    #[test]
    fn a_press_under_half_a_second_is_discarded_once_no_second_tap_follows() {
        let mut harness = Harness::new(Ok(Duration::from_millis(700)), Duration::ZERO);
        harness.hold(0, 450);
        assert!(harness.takes().is_empty());
        assert!(harness.log.borrow().mic_open);
        harness.tick(750);
        assert_eq!(harness.takes(), vec!["too short"]);
        assert!(!harness.log.borrow().mic_open);
    }

    #[test]
    fn a_double_tap_records_hands_free_from_the_first_press_until_the_stop_tap() {
        let mut harness = Harness::new(Ok(Duration::from_millis(5050)), Duration::ZERO);
        harness.double_tap();
        harness.tick(10_000);
        assert!(harness.takes().is_empty());
        assert!(harness.log.borrow().mic_open);
        assert_eq!(
            harness.events(),
            vec!["may record", "listening", "start", "hands-free"]
        );
        harness.hold(5000, 5100);
        assert_eq!(harness.takes(), vec!["recorded 5100ms of 5050ms"]);
        assert!(!harness.log.borrow().mic_open);
    }

    #[test]
    fn hands_free_is_cancelled_by_esc_and_stopped_from_the_overlay() {
        let mut harness = Harness::new(Ok(Duration::from_secs(3)), Duration::ZERO);
        harness.double_tap();
        harness.send(ChordEvent::Escape, 3000);
        assert_eq!(harness.takes(), vec!["cancelled"]);
        let stop = Input::Stop {
            at: harness.t0 + Duration::from_millis(3500),
        };
        harness.session.handle(stop);
        assert_eq!(harness.takes().len(), 1);
        harness.hold(10_000, 10_100);
        harness.hold(10_300, 10_400);
        harness.session.handle(Input::Stop {
            at: harness.t0 + Duration::from_millis(13_400),
        });
        assert_eq!(
            harness.takes(),
            vec!["cancelled", "recorded 3400ms of 3000ms"]
        );
    }

    #[test]
    fn a_hold_whose_key_up_never_arrives_ends_once_the_keys_read_up() {
        let mut harness = Harness::new(Ok(Duration::from_millis(1950)), Duration::ZERO);
        harness.send(ChordEvent::Pressed, 0);
        assert_eq!(
            harness.session.deadline(),
            Some(harness.t0 + Duration::from_millis(100))
        );
        harness.tick(100);
        harness.tick(1900);
        assert!(harness.takes().is_empty());
        harness.log.borrow_mut().keys_up = true;
        harness.tick(2000);
        assert_eq!(harness.takes(), vec!["recorded 2000ms of 1950ms"]);
        assert_eq!(harness.session.deadline(), None);
    }

    #[test]
    fn a_stop_tap_whose_key_up_is_lost_still_stops_hands_free() {
        let mut harness = Harness::new(Ok(Duration::from_secs(4)), Duration::ZERO);
        harness.double_tap();
        harness.send(ChordEvent::Pressed, 4000);
        harness.log.borrow_mut().keys_up = true;
        harness.tick(4100);
        assert_eq!(harness.takes(), vec!["recorded 4100ms of 4000ms"]);
    }

    #[test]
    fn hands_free_stops_at_two_minutes_and_a_later_tap_does_not_resume_it() {
        let mut harness = Harness::new(Ok(MAX_RECORDING), Duration::ZERO);
        harness.double_tap();
        harness.tick(MAX_RECORDING.as_millis() as u64);
        assert_eq!(harness.takes(), vec!["recorded 120000ms of 120000ms"]);
        harness.hold(130_000, 130_100);
        harness.tick(130_400);
        assert_eq!(harness.takes()[1], "too short");
    }

    #[test]
    fn the_microphone_check_monitors_only_while_shown_and_a_hold_still_dictates() {
        let mut harness = Harness::new(Ok(Duration::from_secs(2)), Duration::ZERO);
        harness.session.handle(Input::MicrophoneCheck(true));
        harness.hold(0, 2000);
        harness.session.handle(Input::MicrophoneCheck(false));
        assert_eq!(
            harness.events(),
            vec![
                "monitor on",
                "may record",
                "listening",
                "start",
                "monitor on",
                "monitor off"
            ]
        );
        assert_eq!(harness.takes(), vec!["recorded 2000ms of 2000ms"]);
        harness.session.handle(Input::MicrophoneCheck(true));
        harness.send(ChordEvent::Pressed, 3000);
        harness.session.handle(Input::MicrophoneCheck(false));
        harness.send(ChordEvent::Released, 5000);
        assert_eq!(harness.events().last().map(String::as_str), Some("start"));
    }

    #[test]
    fn audio_shorter_than_half_a_second_is_discarded_even_after_a_long_enough_hold() {
        let mut harness = Harness::new(Ok(Duration::from_millis(420)), Duration::ZERO);
        harness.hold(0, 600);
        assert_eq!(harness.takes(), vec!["too short"]);
    }

    #[test]
    fn a_cancelled_chord_discards_the_dictation() {
        let mut harness = Harness::new(Ok(Duration::from_secs(3)), Duration::ZERO);
        harness.send(ChordEvent::Pressed, 0);
        harness.send(ChordEvent::Cancelled, 1500);
        harness.send(ChordEvent::Released, 1600);
        assert_eq!(harness.takes(), vec!["cancelled"]);
        assert!(!harness.log.borrow().mic_open);
    }

    #[test]
    fn holding_past_two_minutes_stops_and_sends_once() {
        let mut harness = Harness::new(Ok(MAX_RECORDING), Duration::ZERO);
        harness.send(ChordEvent::Pressed, 0);
        harness
            .session
            .on_deadline(harness.t0 + MAX_RECORDING - Duration::from_millis(1));
        assert!(harness.takes().is_empty());
        harness.session.on_deadline(harness.t0 + MAX_RECORDING);
        assert_eq!(harness.takes(), vec!["recorded 120000ms of 120000ms"]);
        harness.send(ChordEvent::Released, 130_000);
        assert_eq!(harness.takes().len(), 1);
        assert_eq!(harness.session.deadline(), None);
    }

    #[test]
    fn a_microphone_that_sends_exact_zeros_is_reported_instead_of_dictated() {
        let mut harness = Harness::new(Ok(Duration::from_secs(1)), Duration::ZERO);
        harness.log.borrow_mut().zeros = true;
        harness.hold(0, 1000);
        assert_eq!(
            harness.takes(),
            vec!["failed: the microphone sent only digital silence"]
        );
    }

    #[test]
    fn microphone_errors_surface_as_failures() {
        let mut harness = Harness::new(Err(()), Duration::ZERO);
        harness.hold(0, 1000);
        assert_eq!(
            harness.takes(),
            vec!["failed: the system denied access to the microphone"]
        );
    }
}
