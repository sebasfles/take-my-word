use super::{Hotkey, Key, KeyEvent};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChordEvent {
    Pressed,
    Released,
    Cancelled,
}

#[derive(Debug, Default)]
pub struct ChordTracker {
    down: Vec<Key>,
    active: bool,
}

impl ChordTracker {
    pub fn on_key(&mut self, hotkey: &Hotkey, event: KeyEvent) -> Option<ChordEvent> {
        if event.down {
            self.on_down(hotkey, event.key)
        } else {
            self.on_up(hotkey, event.key)
        }
    }

    pub fn forget_released(&mut self, still_held: impl Fn(Key) -> bool) {
        if !self.active {
            self.down.retain(|key| still_held(*key));
        }
    }

    fn on_down(&mut self, hotkey: &Hotkey, key: Key) -> Option<ChordEvent> {
        if self.down.contains(&key) {
            return None;
        }
        self.down.push(key);
        if self.active {
            if hotkey.contains(key) {
                return None;
            }
            self.active = false;
            return Some(ChordEvent::Cancelled);
        }
        if self.matches_exactly(hotkey) {
            self.active = true;
            return Some(ChordEvent::Pressed);
        }
        None
    }

    fn on_up(&mut self, hotkey: &Hotkey, key: Key) -> Option<ChordEvent> {
        self.down.retain(|held| *held != key);
        if self.active && !self.holds_every_key(hotkey) {
            self.active = false;
            return Some(ChordEvent::Released);
        }
        None
    }

    fn holds_every_key(&self, hotkey: &Hotkey) -> bool {
        hotkey
            .keys()
            .iter()
            .all(|wanted| self.down.iter().any(|held| wanted.matches(*held)))
    }

    fn matches_exactly(&self, hotkey: &Hotkey) -> bool {
        self.holds_every_key(hotkey) && self.down.iter().all(|held| hotkey.contains(*held))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hotkey::{HotkeyKey, Side};

    const LCTRL: Key = Key::Ctrl(Side::Left);
    const RCTRL: Key = Key::Ctrl(Side::Right);
    const LWIN: Key = Key::Meta(Side::Left);
    const SHIFT: Key = Key::Shift(Side::Left);
    const LEFT_ARROW: Key = Key::Other(0x25);

    fn down(key: Key) -> KeyEvent {
        KeyEvent { key, down: true }
    }

    fn up(key: Key) -> KeyEvent {
        KeyEvent { key, down: false }
    }

    fn feed(tracker: &mut ChordTracker, events: &[KeyEvent]) -> Vec<ChordEvent> {
        let hotkey = Hotkey::default();
        events
            .iter()
            .filter_map(|event| tracker.on_key(&hotkey, *event))
            .collect()
    }

    #[test]
    fn ctrl_then_win_presses_and_releasing_either_releases() {
        let mut tracker = ChordTracker::default();
        assert_eq!(
            feed(
                &mut tracker,
                &[down(LCTRL), down(LWIN), up(LWIN), up(LCTRL)]
            ),
            vec![ChordEvent::Pressed, ChordEvent::Released]
        );
    }

    #[test]
    fn win_then_right_ctrl_presses_too() {
        let mut tracker = ChordTracker::default();
        assert_eq!(
            feed(&mut tracker, &[down(LWIN), down(RCTRL), up(RCTRL)]),
            vec![ChordEvent::Pressed, ChordEvent::Released]
        );
    }

    #[test]
    fn autorepeat_while_holding_does_not_press_again() {
        let mut tracker = ChordTracker::default();
        let events = [
            down(LCTRL),
            down(LWIN),
            down(LWIN),
            down(LCTRL),
            down(LWIN),
            up(LCTRL),
        ];
        assert_eq!(
            feed(&mut tracker, &events),
            vec![ChordEvent::Pressed, ChordEvent::Released]
        );
    }

    #[test]
    fn extra_modifier_held_before_the_chord_does_not_press() {
        let mut tracker = ChordTracker::default();
        assert!(feed(&mut tracker, &[down(SHIFT), down(LCTRL), down(LWIN)]).is_empty());
    }

    #[test]
    fn another_key_during_the_hold_cancels_and_does_not_restart_on_its_release() {
        let mut tracker = ChordTracker::default();
        let events = [
            down(LCTRL),
            down(LWIN),
            down(LEFT_ARROW),
            up(LEFT_ARROW),
            up(LWIN),
            up(LCTRL),
        ];
        assert_eq!(
            feed(&mut tracker, &events),
            vec![ChordEvent::Pressed, ChordEvent::Cancelled]
        );
        assert_eq!(
            feed(&mut tracker, &[down(LCTRL), down(LWIN), up(LCTRL)]),
            vec![ChordEvent::Pressed, ChordEvent::Released]
        );
    }

    #[test]
    fn keys_whose_release_was_missed_are_forgotten_before_the_next_press() {
        let hotkey = Hotkey::default();
        let mut tracker = ChordTracker::default();
        let lock_screen = Key::Other(0x4C);
        feed(&mut tracker, &[down(LWIN), down(lock_screen)]);
        tracker.forget_released(|key| key == LWIN);
        assert_eq!(tracker.on_key(&hotkey, down(LWIN)), None);
        assert_eq!(
            tracker.on_key(&hotkey, down(LCTRL)),
            Some(ChordEvent::Pressed)
        );
    }

    #[test]
    fn custom_hotkey_with_a_regular_key() {
        let hotkey = Hotkey::new(vec![HotkeyKey::Shift, HotkeyKey::Code(0x7C)]).unwrap();
        let mut tracker = ChordTracker::default();
        assert_eq!(tracker.on_key(&hotkey, down(SHIFT)), None);
        assert_eq!(
            tracker.on_key(&hotkey, down(Key::Other(0x7C))),
            Some(ChordEvent::Pressed)
        );
        assert_eq!(
            tracker.on_key(&hotkey, up(Key::Other(0x7C))),
            Some(ChordEvent::Released)
        );
    }
}
