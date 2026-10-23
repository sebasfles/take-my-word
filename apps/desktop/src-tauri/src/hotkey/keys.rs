use std::time::{Duration, Instant};

use super::chord::ChordTracker;
use super::{ChordEvent, Hotkey, KeyEvent, KeyHook};

pub const CAPTURE_TIMEOUT: Duration = Duration::from_secs(15);
const TWIN_WINDOW: Duration = Duration::from_millis(250);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Source {
    Hook,
    Page,
}

#[derive(Debug, Default)]
struct Twins {
    unmatched: Vec<(Source, KeyEvent, Instant)>,
}

impl Twins {
    fn admit(&mut self, source: Source, event: KeyEvent, at: Instant) -> bool {
        self.unmatched
            .retain(|(_, _, seen)| at.saturating_duration_since(*seen) < TWIN_WINDOW);
        let twin = self
            .unmatched
            .iter()
            .position(|(other, seen, _)| *other != source && *seen == event);
        if let Some(index) = twin {
            self.unmatched.remove(index);
            return false;
        }
        self.unmatched.push((source, event, at));
        true
    }
}

#[derive(Debug)]
struct Capture {
    deadline: Instant,
}

#[derive(Debug)]
pub struct Keys {
    tracker: ChordTracker,
    capture: Option<Capture>,
    twins: Twins,
}

impl Keys {
    pub fn new(hotkey: Hotkey) -> Self {
        Self {
            tracker: ChordTracker::new(hotkey),
            capture: None,
            twins: Twins::default(),
        }
    }

    pub fn hotkey(&self) -> &Hotkey {
        self.tracker.hotkey()
    }

    pub fn on_key(
        &mut self,
        event: KeyEvent,
        source: Source,
        at: Instant,
        keyboard: &dyn KeyHook,
    ) -> Option<ChordEvent> {
        if !self.twins.admit(source, event, at) || self.capture.is_some() {
            return None;
        }
        self.tracker.on_key(event, keyboard)
    }

    pub fn release_if_up(&mut self, keyboard: &dyn KeyHook) -> Option<ChordEvent> {
        if self.capture.is_some() {
            return None;
        }
        self.tracker.release_if_up(keyboard)
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
            .filter_map(|event| keys.on_key(event, Source::Hook, Instant::now(), &Keyboard))
            .collect()
    }

    fn event(key: Key, down: bool) -> KeyEvent {
        KeyEvent { key, down }
    }

    #[test]
    fn a_key_seen_by_the_hook_and_the_page_counts_once() {
        let t0 = Instant::now();
        let at = |ms| t0 + Duration::from_millis(ms);
        let mut keys = Keys::new(Hotkey::ctrl_win());
        let mut seen = Vec::new();
        for (source, key, down, ms) in [
            (Source::Hook, CTRL, true, 0),
            (Source::Hook, WIN, true, 10),
            (Source::Page, CTRL, true, 30),
            (Source::Hook, WIN, false, 100),
            (Source::Page, WIN, true, 110),
            (Source::Page, WIN, false, 120),
            (Source::Hook, WIN, true, 200),
            (Source::Page, WIN, true, 230),
            (Source::Hook, WIN, false, 300),
            (Source::Page, WIN, false, 320),
        ] {
            seen.extend(keys.on_key(event(key, down), source, at(ms), &Keyboard));
        }
        assert_eq!(
            seen,
            vec![
                ChordEvent::Pressed,
                ChordEvent::Released,
                ChordEvent::Pressed,
                ChordEvent::Released
            ]
        );
    }

    #[test]
    fn the_page_alone_drives_the_chord_when_the_hook_sees_nothing() {
        let t0 = Instant::now();
        let mut keys = Keys::new(Hotkey::ctrl_win());
        let seen: Vec<_> = [(CTRL, true), (WIN, true), (WIN, false), (CTRL, false)]
            .into_iter()
            .enumerate()
            .filter_map(|(index, (key, down))| {
                let at = t0 + Duration::from_millis(index as u64 * 40);
                keys.on_key(event(key, down), Source::Page, at, &Keyboard)
            })
            .collect();
        assert_eq!(seen, vec![ChordEvent::Pressed, ChordEvent::Released]);
        let later = t0 + TWIN_WINDOW * 4;
        assert_eq!(
            keys.on_key(event(CTRL, true), Source::Hook, later, &Keyboard),
            None
        );
        assert_eq!(
            keys.on_key(event(WIN, true), Source::Hook, later, &Keyboard),
            Some(ChordEvent::Pressed)
        );
    }

    struct Released;

    impl KeyHook for Released {
        fn guard_start_menu(&self) {}

        fn is_held(&self, _key: Key) -> bool {
            false
        }
    }

    #[test]
    fn a_page_only_press_with_no_key_up_releases_once_the_keys_read_up() {
        let t0 = Instant::now();
        let mut keys = Keys::new(Hotkey::ctrl_win());
        keys.on_key(event(CTRL, true), Source::Page, t0, &Keyboard);
        assert_eq!(
            keys.on_key(event(WIN, true), Source::Page, t0, &Keyboard),
            Some(ChordEvent::Pressed)
        );
        assert_eq!(keys.release_if_up(&Keyboard), None);
        assert_eq!(keys.release_if_up(&Released), Some(ChordEvent::Released));
        assert_eq!(keys.release_if_up(&Released), None);
    }

    #[test]
    fn page_keys_are_ignored_during_a_capture_like_hook_keys() {
        let now = Instant::now();
        let mut keys = Keys::new(Hotkey::ctrl_win());
        keys.start_capture(now);
        assert_eq!(
            keys.on_key(event(CTRL, true), Source::Page, now, &Keyboard),
            None
        );
        assert_eq!(
            keys.on_key(event(WIN, true), Source::Page, now, &Keyboard),
            None
        );
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
            keys.on_key(
                KeyEvent { key, down: true },
                Source::Hook,
                Instant::now(),
                &Keyboard,
            );
        }
        assert_eq!(
            keys.start_capture(Instant::now()),
            Some(ChordEvent::Cancelled)
        );
    }
}
