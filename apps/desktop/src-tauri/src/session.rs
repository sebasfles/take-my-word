use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use crate::audio::{AudioError, Capture, Captured, MAX_RECORDING, MIN_RECORDING};
use crate::hotkey::ChordEvent;

pub enum Input {
    Chord { event: ChordEvent, at: Instant },
}

#[derive(Debug)]
pub enum Take {
    Recorded { captured: Captured, held: Duration },
    TooShort,
    Cancelled,
    Failed(AudioError),
}

pub trait Sink {
    fn listening(&mut self);
    fn finished(&mut self, take: Take);
}

pub struct Session<C, S> {
    capture: C,
    sink: S,
    recording_since: Option<Instant>,
}

impl<C: Capture, S: Sink> Session<C, S> {
    pub fn new(capture: C, sink: S) -> Self {
        Self {
            capture,
            sink,
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
            match next {
                Some(input) => self.handle(input),
                None => self.on_deadline(Instant::now()),
            }
        }
    }

    fn deadline(&self) -> Option<Instant> {
        self.recording_since.map(|since| since + MAX_RECORDING)
    }

    fn handle(&mut self, input: Input) {
        match input {
            Input::Chord { event, at } => match event {
                ChordEvent::Pressed => self.begin(at),
                ChordEvent::Released => self.end(at),
                ChordEvent::Cancelled => self.cancel(),
            },
        }
    }

    fn on_deadline(&mut self, now: Instant) {
        if self.deadline().is_some_and(|deadline| now >= deadline) {
            self.end(now);
        }
    }

    fn begin(&mut self, at: Instant) {
        if self.recording_since.is_some() {
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
        self.sink.finished(take(held, captured));
    }

    fn cancel(&mut self) {
        if self.recording_since.take().is_some() {
            let _ = self.capture.stop();
            self.sink.finished(Take::Cancelled);
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
        fn listening(&mut self) {
            self.0.borrow_mut().events.push("listening".into());
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
        assert_eq!(harness.log.borrow().events, vec!["listening", "start"]);
        assert!(!harness.log.borrow().mic_open);
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
    fn a_press_under_half_a_second_is_discarded_and_releases_the_microphone() {
        let mut harness = Harness::new(Ok(Duration::from_millis(400)), Duration::ZERO);
        harness.hold(0, 450);
        assert_eq!(harness.takes(), vec!["too short"]);
        assert!(!harness.log.borrow().mic_open);
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
        assert_eq!(harness.session.deadline(), Some(harness.t0 + MAX_RECORDING));
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
