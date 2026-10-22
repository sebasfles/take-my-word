use std::time::{Duration, Instant};

use super::chord::ChordTracker;
use super::{ChordEvent, Hotkey, KeyEvent, KeyHook};

pub const CAPTURE_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug)]
struct Capture {
    deadline: Instant,
}

#[derive(Debug)]
pub struct Keys {
    tracker: ChordTracker,
    capture: Option<Capture>,
}

impl Keys {
    pub fn new(hotkey: Hotkey) -> Self {
        Self {
            tracker: ChordTracker::new(hotkey),
            capture: None,
        }
    }

    pub fn hotkey(&self) -> &Hotkey {
        self.tracker.hotkey()
    }

    pub fn on_key(&mut self, event: KeyEvent, keyboard: &dyn KeyHook) -> Option<ChordEvent> {
        if self.capture.is_some() {
            return None;
        }
        self.tracker.on_key(event, keyboard)
    }

    pub fn start_capture(&mut self, now: Instant) -> Option<ChordEvent> {
        let interrupted = self.tracker.is_active().then_some(ChordEvent::Cancelled);
        self.tracker = ChordTracker::new(self.tracker.hotkey().clone());
        self.capture = Some(Capture {
            deadline: now + CAPTURE_TIMEOUT,
        });
        interrupted
    }

    pub fn is_capturing(&self, now: Instant) -> bool {
        self.capture
            .as_ref()
            .is_some_and(|capture| now < capture.deadline)
    }

    pub fn finish_capture(&mut self, hotkey: Option<Hotkey>) -> bool {
        let finished = self.capture.take().is_some();
        if let Some(hotkey) = hotkey {
            self.tracker = ChordTracker::new(hotkey);
        }
        finished
    }

    pub fn cancel_capture_unless(&mut self, foreground_is_ours: bool) -> bool {
        if foreground_is_ours {
            return false;
        }
        self.capture.take().is_some()
    }

    pub fn expire_capture(&mut self, now: Instant) -> bool {
        if self
            .capture
            .as_ref()
            .is_some_and(|capture| now >= capture.deadline)
        {
            self.capture = None;
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hotkey::{HotkeyKey, Key, Side};

    const CTRL: Key = Key::Ctrl(Side::Left);
    const WIN: Key = Key::Meta(Side::Left);
    const SHIFT: Key = Key::Shift(Side::Left);

    struct Keyboard;

    impl KeyHook for Keyboard {
        fn guard_start_menu(&self) {}

        fn is_held(&self, _key: Key) -> bool {
            true
        }
    }

    fn tap(keys: &mut Keys, pressed: &[Key]) -> Vec<ChordEvent> {
        let downs = pressed.iter().map(|key| KeyEvent {
            key: *key,
            down: true,
        });
        let ups = pressed.iter().rev().map(|key| KeyEvent {
            key: *key,
            down: false,
        });
        downs
            .chain(ups)
            .filter_map(|event| keys.on_key(event, &Keyboard))
            .collect()
    }

    #[test]
    fn chords_are_ignored_while_capturing_and_the_old_hotkey_stays_until_saved() {
        let now = Instant::now();
        let mut keys = Keys::new(Hotkey::ctrl_win());
        keys.start_capture(now);
        assert!(keys.is_capturing(now));
        assert!(tap(&mut keys, &[CTRL, WIN]).is_empty());
        assert!(keys.finish_capture(None));
        assert_eq!(keys.hotkey(), &Hotkey::ctrl_win());
        assert_eq!(tap(&mut keys, &[CTRL, WIN]).len(), 2);
    }

    #[test]
    fn a_saved_hotkey_works_at_once_and_the_old_one_stops() {
        let mut keys = Keys::new(Hotkey::ctrl_win());
        keys.start_capture(Instant::now());
        let ctrl_shift = Hotkey::new(vec![HotkeyKey::Ctrl, HotkeyKey::Shift]).unwrap();
        keys.finish_capture(Some(ctrl_shift.clone()));
        assert_eq!(keys.hotkey(), &ctrl_shift);
        assert!(tap(&mut keys, &[CTRL, WIN]).is_empty());
        assert_eq!(tap(&mut keys, &[CTRL, SHIFT]).len(), 2);
    }

    #[test]
    fn losing_the_foreground_or_the_deadline_ends_the_capture() {
        let now = Instant::now();
        let mut keys = Keys::new(Hotkey::ctrl_win());
        keys.start_capture(now);
        assert!(!keys.cancel_capture_unless(true));
        assert!(keys.is_capturing(now));
        assert!(keys.cancel_capture_unless(false));
        assert!(!keys.is_capturing(now));
        keys.start_capture(now);
        assert!(!keys.expire_capture(now + CAPTURE_TIMEOUT - Duration::from_millis(1)));
        assert!(keys.expire_capture(now + CAPTURE_TIMEOUT));
        assert!(!keys.is_capturing(now));
    }

    #[test]
    fn chords_resume_after_every_way_a_capture_ends() {
        let now = Instant::now();
        type Exit = fn(&mut Keys, Instant) -> bool;
        let exits: [(&str, Exit); 4] = [
            ("save", |keys, _| {
                keys.finish_capture(Some(Hotkey::ctrl_win()))
            }),
            ("cancel", |keys, _| keys.finish_capture(None)),
            ("blur", |keys, _| keys.cancel_capture_unless(false)),
            ("timeout", |keys, now| {
                keys.expire_capture(now + CAPTURE_TIMEOUT)
            }),
        ];
        for (name, exit) in exits {
            let mut keys = Keys::new(Hotkey::ctrl_win());
            keys.start_capture(now);
            assert!(tap(&mut keys, &[CTRL, WIN]).is_empty(), "{name}");
            assert!(exit(&mut keys, now), "{name}");
            assert_eq!(tap(&mut keys, &[CTRL, WIN]).len(), 2, "{name}");
        }
    }

    #[test]
    fn starting_a_capture_mid_dictation_cancels_it() {
        let mut keys = Keys::new(Hotkey::ctrl_win());
        for key in [CTRL, WIN] {
            keys.on_key(KeyEvent { key, down: true }, &Keyboard);
        }
        assert_eq!(
            keys.start_capture(Instant::now()),
            Some(ChordEvent::Cancelled)
        );
    }
}
