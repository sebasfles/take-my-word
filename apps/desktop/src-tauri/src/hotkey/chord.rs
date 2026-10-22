use super::{ESCAPE, Hotkey, Key, KeyEvent, KeyHook};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChordEvent {
    Pressed,
    Released,
    Cancelled,
    Escape,
}

#[derive(Debug)]
pub struct ChordTracker {
    hotkey: Hotkey,
    down: Vec<Key>,
    active: bool,
}

impl ChordTracker {
    pub fn new(hotkey: Hotkey) -> Self {
        Self {
            hotkey,
            down: Vec::new(),
            active: false,
        }
    }

    pub fn hotkey(&self) -> &Hotkey {
        &self.hotkey
    }

    pub fn is_active(&self) -> bool {
        self.active
    }

    pub fn on_key(&mut self, event: KeyEvent, keyboard: &dyn KeyHook) -> Option<ChordEvent> {
        let chord = if event.down {
            if !self.active {
                self.down
                    .retain(|key| *key == event.key || keyboard.is_held(*key));
            }
            let escape = event.key == ESCAPE
                && !self.active
                && !self.down.contains(&event.key)
                && !self.hotkey.contains(ESCAPE);
            let chord = self.on_down(event.key);
            if escape {
                return Some(ChordEvent::Escape);
            }
            chord
        } else {
            self.on_up(event.key)
        };
        if chord == Some(ChordEvent::Pressed) && self.hotkey.uses_meta() {
            keyboard.guard_start_menu();
        }
        chord
    }

    fn on_down(&mut self, key: Key) -> Option<ChordEvent> {
        if self.down.contains(&key) {
            return None;
        }
        self.down.push(key);
        if self.active {
            if self.hotkey.contains(key) {
                return None;
            }
            self.active = false;
            return Some(ChordEvent::Cancelled);
        }
        if self.matches_exactly() {
            self.active = true;
            return Some(ChordEvent::Pressed);
        }
        None
    }

    fn on_up(&mut self, key: Key) -> Option<ChordEvent> {
        self.down.retain(|held| *held != key);
        if self.active && !self.holds_every_key() {
            self.active = false;
            return Some(ChordEvent::Released);
        }
        None
    }

    fn holds_every_key(&self) -> bool {
        self.hotkey
            .keys()
            .iter()
            .all(|wanted| self.down.iter().any(|held| wanted.matches(*held)))
    }

    fn matches_exactly(&self) -> bool {
        self.holds_every_key() && self.down.iter().all(|held| self.hotkey.contains(*held))
    }
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use super::*;
    use crate::hotkey::{HotkeyKey, Side};

    const LCTRL: Key = Key::Ctrl(Side::Left);
    const RCTRL: Key = Key::Ctrl(Side::Right);
    const LWIN: Key = Key::Meta(Side::Left);
    const SHIFT: Key = Key::Shift(Side::Left);
    const LEFT_ARROW: Key = Key::Other(0x25);

    #[derive(Default)]
    struct FakeKeyboard {
        released_unseen: RefCell<Vec<Key>>,
        guards: Cell<usize>,
    }

    impl KeyHook for FakeKeyboard {
        fn guard_start_menu(&self) {
            self.guards.set(self.guards.get() + 1);
        }

        fn is_held(&self, key: Key) -> bool {
            !self.released_unseen.borrow().contains(&key)
        }
    }

    fn down(key: Key) -> KeyEvent {
        KeyEvent { key, down: true }
    }

    fn up(key: Key) -> KeyEvent {
        KeyEvent { key, down: false }
    }

    fn feed(
        tracker: &mut ChordTracker,
        keyboard: &FakeKeyboard,
        events: &[KeyEvent],
    ) -> Vec<ChordEvent> {
        events
            .iter()
            .filter_map(|event| tracker.on_key(*event, keyboard))
            .collect()
    }

    fn ctrl_win() -> (ChordTracker, FakeKeyboard) {
        (
            ChordTracker::new(Hotkey::ctrl_win()),
            FakeKeyboard::default(),
        )
    }

    #[test]
    fn ctrl_then_win_presses_once_guards_the_start_menu_and_releasing_either_releases() {
        let (mut tracker, keyboard) = ctrl_win();
        assert_eq!(
            feed(
                &mut tracker,
                &keyboard,
                &[down(LCTRL), down(LWIN), up(LWIN), up(LCTRL)]
            ),
            vec![ChordEvent::Pressed, ChordEvent::Released]
        );
        assert_eq!(keyboard.guards.get(), 1);
    }

    #[test]
    fn win_then_right_ctrl_presses_too() {
        let (mut tracker, keyboard) = ctrl_win();
        assert_eq!(
            feed(
                &mut tracker,
                &keyboard,
                &[down(LWIN), down(RCTRL), up(RCTRL)]
            ),
            vec![ChordEvent::Pressed, ChordEvent::Released]
        );
    }

    #[test]
    fn autorepeat_while_holding_does_not_press_again() {
        let (mut tracker, keyboard) = ctrl_win();
        let events = [
            down(LCTRL),
            down(LWIN),
            down(LWIN),
            down(LCTRL),
            down(LWIN),
            up(LCTRL),
        ];
        assert_eq!(
            feed(&mut tracker, &keyboard, &events),
            vec![ChordEvent::Pressed, ChordEvent::Released]
        );
        assert_eq!(keyboard.guards.get(), 1);
    }

    #[test]
    fn extra_modifier_held_before_the_chord_does_not_press() {
        let (mut tracker, keyboard) = ctrl_win();
        assert!(
            feed(
                &mut tracker,
                &keyboard,
                &[down(SHIFT), down(LCTRL), down(LWIN)]
            )
            .is_empty()
        );
    }

    #[test]
    fn another_key_during_the_hold_cancels_and_does_not_restart_on_its_release() {
        let (mut tracker, keyboard) = ctrl_win();
        let events = [
            down(LCTRL),
            down(LWIN),
            down(LEFT_ARROW),
            up(LEFT_ARROW),
            up(LWIN),
            up(LCTRL),
        ];
        assert_eq!(
            feed(&mut tracker, &keyboard, &events),
            vec![ChordEvent::Pressed, ChordEvent::Cancelled]
        );
        assert_eq!(
            feed(
                &mut tracker,
                &keyboard,
                &[down(LCTRL), down(LWIN), up(LCTRL)]
            ),
            vec![ChordEvent::Pressed, ChordEvent::Released]
        );
    }

    #[test]
    fn keys_whose_release_was_missed_are_forgotten_before_the_next_press() {
        let (mut tracker, keyboard) = ctrl_win();
        let lock_screen = Key::Other(0x4C);
        feed(&mut tracker, &keyboard, &[down(LWIN), down(lock_screen)]);
        *keyboard.released_unseen.borrow_mut() = vec![lock_screen];
        assert_eq!(
            feed(&mut tracker, &keyboard, &[down(LWIN), down(LCTRL)]),
            vec![ChordEvent::Pressed]
        );
    }

    #[test]
    fn esc_outside_a_hold_is_reported_once_and_inside_a_hold_cancels() {
        let (mut tracker, keyboard) = ctrl_win();
        assert_eq!(
            feed(
                &mut tracker,
                &keyboard,
                &[down(ESCAPE), down(ESCAPE), up(ESCAPE)]
            ),
            vec![ChordEvent::Escape]
        );
        assert_eq!(
            feed(
                &mut tracker,
                &keyboard,
                &[down(LCTRL), down(LWIN), down(ESCAPE), up(ESCAPE)]
            ),
            vec![ChordEvent::Pressed, ChordEvent::Cancelled]
        );
    }

    #[test]
    fn custom_hotkey_without_win_never_guards_the_start_menu() {
        let hotkey = Hotkey::new(vec![HotkeyKey::Shift, HotkeyKey::Code(0x7C)]).unwrap();
        let mut tracker = ChordTracker::new(hotkey);
        let keyboard = FakeKeyboard::default();
        assert_eq!(
            feed(
                &mut tracker,
                &keyboard,
                &[down(SHIFT), down(Key::Other(0x7C)), up(Key::Other(0x7C))]
            ),
            vec![ChordEvent::Pressed, ChordEvent::Released]
        );
        assert_eq!(keyboard.guards.get(), 0);
    }
}
