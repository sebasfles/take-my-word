use std::time::{Duration, Instant};

use super::ChordEvent;

pub const TAP: Duration = Duration::from_millis(500);
pub const DOUBLE_TAP_GAP: Duration = Duration::from_millis(300);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
    Start,
    HandsFree,
    Stop,
    Discard,
    Cancel,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum State {
    Idle,
    Holding { since: Instant, second: bool },
    Tapped { released: Instant },
    HandsFree { pressed: bool },
}

#[derive(Debug)]
pub struct Gesture {
    state: State,
}

impl Default for Gesture {
    fn default() -> Self {
        Self { state: State::Idle }
    }
}

impl Gesture {
    pub fn is_hands_free(&self) -> bool {
        matches!(self.state, State::HandsFree { .. })
    }

    pub fn reset(&mut self) {
        self.state = State::Idle;
    }

    pub fn deadline(&self) -> Option<Instant> {
        match self.state {
            State::Tapped { released } => Some(released + DOUBLE_TAP_GAP),
            _ => None,
        }
    }

    pub fn on_deadline(&mut self, now: Instant) -> Option<Command> {
        let deadline = self.deadline()?;
        if now < deadline {
            return None;
        }
        log::info!(
            "hotkey: no second tap within {} ms",
            DOUBLE_TAP_GAP.as_millis()
        );
        self.state = State::Idle;
        Some(Command::Discard)
    }

    pub fn on_chord(&mut self, event: ChordEvent, at: Instant) -> Vec<Command> {
        let expired = self.on_deadline(at);
        let next = self.step(event, at);
        expired.into_iter().chain(next).collect()
    }

    fn step(&mut self, event: ChordEvent, at: Instant) -> Option<Command> {
        let (state, command) = match (self.state, event) {
            (State::Idle, ChordEvent::Pressed) => (
                State::Holding {
                    since: at,
                    second: false,
                },
                Some(Command::Start),
            ),
            (State::Tapped { released }, ChordEvent::Pressed) => {
                log::info!(
                    "hotkey: second press {} ms after the first tap",
                    at.saturating_duration_since(released).as_millis()
                );
                (
                    State::Holding {
                        since: at,
                        second: true,
                    },
                    None,
                )
            }
            (State::Holding { since, second }, ChordEvent::Released) => {
                let held = at.saturating_duration_since(since);
                log::info!(
                    "hotkey: {} press held {} ms",
                    if second { "second" } else { "first" },
                    held.as_millis()
                );
                match (held < TAP, second) {
                    (true, false) => (State::Tapped { released: at }, None),
                    (true, true) => (
                        State::HandsFree { pressed: false },
                        Some(Command::HandsFree),
                    ),
                    (false, _) => (State::Idle, Some(Command::Stop)),
                }
            }
            (State::Holding { .. }, ChordEvent::Cancelled) => (State::Idle, Some(Command::Cancel)),
            (State::HandsFree { pressed: false }, ChordEvent::Pressed) => {
                (State::HandsFree { pressed: true }, None)
            }
            (State::HandsFree { pressed: true }, ChordEvent::Released) => {
                log::info!("hotkey: hands-free stopped by a tap");
                (State::Idle, Some(Command::Stop))
            }
            (State::HandsFree { pressed: true }, ChordEvent::Cancelled) => {
                log::info!("hotkey: a shortcut during hands-free, still listening");
                (State::HandsFree { pressed: false }, None)
            }
            (State::HandsFree { .. }, ChordEvent::Escape) => {
                log::info!("hotkey: hands-free cancelled with Esc");
                (State::Idle, Some(Command::Cancel))
            }
            (state, _) => (state, None),
        };
        self.state = state;
        command
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Clock {
        t0: Instant,
        gesture: Gesture,
    }

    impl Clock {
        fn new() -> Self {
            Self {
                t0: Instant::now(),
                gesture: Gesture::default(),
            }
        }

        fn at(&self, ms: u64) -> Instant {
            self.t0 + Duration::from_millis(ms)
        }

        fn send(&mut self, event: ChordEvent, ms: u64) -> Vec<Command> {
            let at = self.at(ms);
            self.gesture.on_chord(event, at)
        }

        fn tick(&mut self, ms: u64) -> Option<Command> {
            let at = self.at(ms);
            self.gesture.on_deadline(at)
        }

        fn double_tap(&mut self) -> Vec<Command> {
            [
                (ChordEvent::Pressed, 0),
                (ChordEvent::Released, 150),
                (ChordEvent::Pressed, 350),
                (ChordEvent::Released, 480),
            ]
            .into_iter()
            .flat_map(|(event, ms)| self.send(event, ms))
            .collect()
        }
    }

    use ChordEvent::{Cancelled, Escape, Pressed, Released};

    #[test]
    fn a_hold_starts_at_the_press_and_stops_at_the_release() {
        let mut clock = Clock::new();
        assert_eq!(clock.send(Pressed, 0), vec![Command::Start]);
        assert_eq!(clock.send(Released, 2000), vec![Command::Stop]);
        assert_eq!(clock.gesture.deadline(), None);
    }

    #[test]
    fn a_double_tap_keeps_the_first_recording_and_turns_it_hands_free() {
        let mut clock = Clock::new();
        assert_eq!(clock.double_tap(), vec![Command::Start, Command::HandsFree]);
        assert!(clock.gesture.is_hands_free());
        assert_eq!(clock.tick(10_000), None);
    }

    #[test]
    fn hands_free_stops_at_the_release_of_a_single_tap_not_at_its_press() {
        let mut clock = Clock::new();
        clock.double_tap();
        assert!(clock.send(Pressed, 5000).is_empty());
        assert!(clock.gesture.is_hands_free());
        assert_eq!(clock.send(Released, 5100), vec![Command::Stop]);
        assert!(!clock.gesture.is_hands_free());
    }

    #[test]
    fn a_single_tap_without_a_second_is_discarded_once_the_gap_passes() {
        let mut clock = Clock::new();
        assert_eq!(clock.send(Pressed, 0), vec![Command::Start]);
        assert!(clock.send(Released, 200).is_empty());
        assert_eq!(clock.gesture.deadline(), Some(clock.at(500)));
        assert_eq!(clock.tick(499), None);
        assert_eq!(clock.tick(500), Some(Command::Discard));
        assert_eq!(clock.tick(900), None);
    }

    #[test]
    fn a_second_press_after_the_gap_is_a_new_dictation() {
        let mut clock = Clock::new();
        clock.send(Pressed, 0);
        clock.send(Released, 200);
        assert_eq!(
            clock.send(Pressed, 501),
            vec![Command::Discard, Command::Start]
        );
        assert_eq!(clock.send(Released, 1800), vec![Command::Stop]);
    }

    #[test]
    fn a_second_press_held_past_half_a_second_is_a_normal_hold() {
        let mut clock = Clock::new();
        clock.send(Pressed, 0);
        clock.send(Released, 150);
        assert!(clock.send(Pressed, 300).is_empty());
        assert_eq!(clock.send(Released, 800), vec![Command::Stop]);
        assert!(!clock.gesture.is_hands_free());
    }

    #[test]
    fn a_first_press_held_past_half_a_second_never_waits_for_a_second_tap() {
        let mut clock = Clock::new();
        clock.send(Pressed, 0);
        assert_eq!(clock.send(Released, 500), vec![Command::Stop]);
        assert_eq!(clock.gesture.deadline(), None);
    }

    #[test]
    fn a_shortcut_during_hands_free_leaves_it_listening() {
        let mut clock = Clock::new();
        clock.double_tap();
        assert!(clock.send(Pressed, 3000).is_empty());
        assert!(clock.send(Cancelled, 3050).is_empty());
        assert!(clock.gesture.is_hands_free());
        assert!(clock.send(Released, 3100).is_empty());
        assert!(clock.gesture.is_hands_free());
        clock.send(Pressed, 4000);
        assert_eq!(clock.send(Released, 4100), vec![Command::Stop]);
    }

    #[test]
    fn esc_cancels_only_hands_free() {
        let mut clock = Clock::new();
        assert!(clock.send(Escape, 0).is_empty());
        clock.send(Pressed, 100);
        clock.send(Released, 200);
        assert!(clock.send(Escape, 250).is_empty());
        assert!(clock.send(Pressed, 300).is_empty());
        clock.send(Released, 400);
        assert_eq!(clock.send(Escape, 2000), vec![Command::Cancel]);
        assert!(!clock.gesture.is_hands_free());
        assert!(clock.send(Escape, 2100).is_empty());
    }

    #[test]
    fn another_key_during_a_hold_or_the_second_press_cancels() {
        let mut clock = Clock::new();
        clock.send(Pressed, 0);
        assert_eq!(clock.send(Cancelled, 900), vec![Command::Cancel]);
        clock.send(Pressed, 2000);
        clock.send(Released, 2100);
        clock.send(Pressed, 2300);
        assert_eq!(clock.send(Cancelled, 2350), vec![Command::Cancel]);
        assert_eq!(clock.gesture.deadline(), None);
    }

    #[test]
    fn a_reset_forgets_the_gesture() {
        let mut clock = Clock::new();
        clock.double_tap();
        clock.gesture.reset();
        assert!(!clock.gesture.is_hands_free());
        assert!(clock.send(Released, 5000).is_empty());
        assert_eq!(clock.send(Pressed, 6000), vec![Command::Start]);
    }
}
