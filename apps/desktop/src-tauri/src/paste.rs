use std::thread;
use std::time::{Duration, Instant};

use enigo::{Direction, Enigo, Keyboard, Settings};

use crate::api::PasteKeystroke;
use crate::clipboard::Clipboard;
use crate::foreground::ActiveWindow;
use crate::hotkey::OWN_INJECTION_TAG;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PasteResult {
    Pasted,
    PastedClipboardLost,
    LeftInClipboard(Undelivered),
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Undelivered {
    FocusChanged,
    Elevated,
    KeysHeld,
    NotRead,
}

pub trait Keystroke {
    fn paste(&mut self, keystroke: PasteKeystroke) -> Result<(), String>;
}

pub trait Modifiers {
    fn any_held(&self) -> bool;
}

#[derive(Clone, Copy, Debug)]
pub struct Timing {
    pub release_poll: Duration,
    pub release_timeout: Duration,
    pub read_timeout: Duration,
    pub read_grace: Duration,
    pub early_read_wait: Duration,
}

impl Default for Timing {
    fn default() -> Self {
        Self {
            release_poll: Duration::from_millis(10),
            release_timeout: Duration::from_secs(30),
            read_timeout: Duration::from_millis(1500),
            read_grace: Duration::from_millis(150),
            early_read_wait: Duration::from_millis(500),
        }
    }
}

pub struct Paster<C, K, W, M> {
    pub clipboard: C,
    pub keystroke: K,
    pub window: W,
    pub modifiers: M,
    pub timing: Timing,
}

impl<C: Clipboard, K: Keystroke, W: ActiveWindow, M: Modifiers> Paster<C, K, W, M> {
    pub fn paste(
        &mut self,
        text: &str,
        target: Option<isize>,
        keystroke: PasteKeystroke,
    ) -> PasteResult {
        if !self.wait_for_release() {
            return self.leave(text, Undelivered::KeysHeld);
        }
        let foreground = self.window.foreground();
        if foreground.window != target {
            return self.leave(text, Undelivered::FocusChanged);
        }
        if foreground.elevated {
            return self.leave(text, Undelivered::Elevated);
        }
        if let Err(error) = self.clipboard.offer(text) {
            log::warn!("{error}");
            return PasteResult::Failed;
        }
        let sent = Instant::now();
        if let Err(error) = self.keystroke.paste(keystroke) {
            log::warn!("the paste keystroke failed: {error}");
            return self.keep();
        }
        match self.clipboard.wait_for_read(self.timing.read_timeout) {
            Some(read) if read >= sent => thread::sleep(self.timing.read_grace),
            Some(_) => thread::sleep(self.timing.early_read_wait),
            None => return self.keep(),
        }
        match self.clipboard.restore() {
            Ok(()) => PasteResult::Pasted,
            Err(error) => {
                log::warn!("restoring the clipboard failed: {error}");
                PasteResult::PastedClipboardLost
            }
        }
    }

    fn wait_for_release(&self) -> bool {
        let deadline = Instant::now() + self.timing.release_timeout;
        while self.modifiers.any_held() {
            if Instant::now() >= deadline {
                return false;
            }
            thread::sleep(self.timing.release_poll);
        }
        true
    }

    fn leave(&mut self, text: &str, reason: Undelivered) -> PasteResult {
        match self.clipboard.put_text(text) {
            Ok(()) => PasteResult::LeftInClipboard(reason),
            Err(error) => {
                log::warn!("{error}");
                PasteResult::Failed
            }
        }
    }

    fn keep(&mut self) -> PasteResult {
        match self.clipboard.keep_text() {
            Ok(()) => PasteResult::LeftInClipboard(Undelivered::NotRead),
            Err(error) => {
                log::warn!("{error}");
                PasteResult::Failed
            }
        }
    }
}

impl<C: Clipboard, K: Keystroke, W: ActiveWindow, M: Modifiers> crate::dictation::Paste
    for Paster<C, K, W, M>
{
    fn paste(
        &mut self,
        text: &str,
        target: Option<isize>,
        keystroke: PasteKeystroke,
    ) -> PasteResult {
        Paster::paste(self, text, target, keystroke)
    }
}

pub struct EnigoKeystroke;

impl Keystroke for EnigoKeystroke {
    fn paste(&mut self, keystroke: PasteKeystroke) -> Result<(), String> {
        let settings = Settings {
            windows_dw_extra_info: Some(OWN_INJECTION_TAG),
            ..Settings::default()
        };
        let mut enigo = Enigo::new(&settings).map_err(|error| error.to_string())?;
        let (modifiers, key) = keys(keystroke);
        let mut pressed = Vec::new();
        let mut outcome = Ok(());
        for modifier in modifiers {
            outcome = enigo.key(*modifier, Direction::Press);
            if outcome.is_err() {
                break;
            }
            pressed.push(*modifier);
        }
        if outcome.is_ok() {
            outcome = enigo.key(key, Direction::Click);
        }
        for modifier in pressed.into_iter().rev() {
            let released = enigo.key(modifier, Direction::Release);
            outcome = outcome.and(released);
        }
        outcome.map_err(|error| error.to_string())
    }
}

fn keys(keystroke: PasteKeystroke) -> (&'static [enigo::Key], enigo::Key) {
    use enigo::Key::{Control, Meta, Shift, Unicode};
    match keystroke {
        PasteKeystroke::CmdV if cfg!(target_os = "macos") => (&[Meta], Unicode('v')),
        PasteKeystroke::CtrlV | PasteKeystroke::CmdV => (&[Control], Unicode('v')),
        PasteKeystroke::CtrlShiftV => (&[Control, Shift], Unicode('v')),
        #[cfg(not(target_os = "macos"))]
        PasteKeystroke::ShiftInsert => (&[Shift], enigo::Key::Insert),
        #[cfg(target_os = "macos")]
        PasteKeystroke::ShiftInsert => (&[Meta], Unicode('v')),
    }
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};
    use std::rc::Rc;

    use super::*;
    use crate::clipboard::ClipboardError;
    use crate::foreground::ForegroundApp;

    #[derive(Default)]
    struct World {
        log: Vec<String>,
        read_at: Option<Instant>,
        keystroke_fails: bool,
        offer_fails: bool,
        restore_fails: bool,
        elevated: bool,
        focus_moved: bool,
        held_polls: Cell<u32>,
    }

    type Shared = Rc<RefCell<World>>;

    struct FakeClipboard(Shared);

    impl Clipboard for FakeClipboard {
        fn offer(&mut self, text: &str) -> Result<(), ClipboardError> {
            if self.0.borrow().offer_fails {
                return Err(ClipboardError("busy".into()));
            }
            self.0.borrow_mut().log.push(format!("offer {text}"));
            Ok(())
        }

        fn wait_for_read(&mut self, _timeout: Duration) -> Option<Instant> {
            self.0.borrow().read_at
        }

        fn restore(&mut self) -> Result<(), ClipboardError> {
            self.0.borrow_mut().log.push("restore".into());
            if self.0.borrow().restore_fails {
                return Err(ClipboardError("held by another app".into()));
            }
            Ok(())
        }

        fn keep_text(&mut self) -> Result<(), ClipboardError> {
            self.0.borrow_mut().log.push("keep".into());
            Ok(())
        }

        fn put_text(&mut self, text: &str) -> Result<(), ClipboardError> {
            self.0.borrow_mut().log.push(format!("put {text}"));
            Ok(())
        }
    }

    struct FakeKeystroke(Shared);

    impl Keystroke for FakeKeystroke {
        fn paste(&mut self, keystroke: PasteKeystroke) -> Result<(), String> {
            let mut world = self.0.borrow_mut();
            let name = serde_json::to_value(keystroke).unwrap();
            world.log.push(name.as_str().unwrap().into());
            if world.keystroke_fails {
                return Err("blocked".into());
            }
            if world.read_at.is_none_or(|read| read > Instant::now()) {
                world.read_at = world.read_at.map(|_| Instant::now());
            }
            Ok(())
        }
    }

    struct FakeWindow(Shared);

    impl ActiveWindow for FakeWindow {
        fn foreground(&self) -> ForegroundApp {
            ForegroundApp {
                window: Some(if self.0.borrow().focus_moved { 2 } else { 1 }),
                app_id: Some("notepad.exe".into()),
                elevated: self.0.borrow().elevated,
            }
        }
    }

    struct FakeModifiers(Shared);

    impl Modifiers for FakeModifiers {
        fn any_held(&self) -> bool {
            let world = self.0.borrow();
            let remaining = world.held_polls.get();
            if remaining == 0 {
                return false;
            }
            world.held_polls.set(remaining - 1);
            drop(world);
            self.0.borrow_mut().log.push("held".into());
            true
        }
    }

    fn paster(world: &Shared) -> Paster<FakeClipboard, FakeKeystroke, FakeWindow, FakeModifiers> {
        Paster {
            clipboard: FakeClipboard(Rc::clone(world)),
            keystroke: FakeKeystroke(Rc::clone(world)),
            window: FakeWindow(Rc::clone(world)),
            modifiers: FakeModifiers(Rc::clone(world)),
            timing: Timing {
                release_poll: Duration::ZERO,
                release_timeout: Duration::from_secs(1),
                read_timeout: Duration::ZERO,
                read_grace: Duration::ZERO,
                early_read_wait: Duration::ZERO,
            },
        }
    }

    fn world(setup: impl FnOnce(&mut World)) -> Shared {
        let mut world = World::default();
        setup(&mut world);
        Rc::new(RefCell::new(world))
    }

    fn will_be_read(world: &mut World) {
        world.read_at = Some(Instant::now() + Duration::from_secs(3600));
    }

    #[test]
    fn the_clipboard_is_restored_only_after_the_target_read_the_text() {
        let world = world(will_be_read);
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::Pasted
        );
        assert_eq!(world.borrow().log, vec!["offer hola", "ctrl+v", "restore"]);
    }

    #[test]
    fn the_paste_sends_the_keystroke_it_is_given() {
        let world = world(will_be_read);
        let pasted = paster(&world).paste("hola", Some(1), PasteKeystroke::ShiftInsert);
        assert_eq!(pasted, PasteResult::Pasted);
        assert_eq!(
            world.borrow().log,
            vec!["offer hola", "shift+insert", "restore"]
        );
    }

    #[test]
    fn cmd_v_reads_as_ctrl_v_outside_macos() {
        if !cfg!(target_os = "macos") {
            assert_eq!(keys(PasteKeystroke::CmdV), keys(PasteKeystroke::CtrlV));
        }
    }

    #[test]
    fn the_paste_waits_until_every_modifier_is_up() {
        let world = world(|world| {
            will_be_read(world);
            world.held_polls.set(3);
        });
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::Pasted
        );
        assert_eq!(
            world.borrow().log,
            vec!["held", "held", "held", "offer hola", "ctrl+v", "restore"]
        );
    }

    #[test]
    fn a_read_before_the_keystroke_still_restores_after_a_safety_wait() {
        let world = world(|world| world.read_at = Some(Instant::now() - Duration::from_secs(1)));
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::Pasted
        );
        assert_eq!(world.borrow().log, vec!["offer hola", "ctrl+v", "restore"]);
    }

    #[test]
    fn text_nobody_reads_stays_in_the_clipboard() {
        let world = world(|_| {});
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::LeftInClipboard(Undelivered::NotRead)
        );
        assert_eq!(world.borrow().log, vec!["offer hola", "ctrl+v", "keep"]);
    }

    #[test]
    fn a_failed_keystroke_leaves_the_text_in_the_clipboard() {
        let world = world(|world| world.keystroke_fails = true);
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::LeftInClipboard(Undelivered::NotRead)
        );
        assert_eq!(world.borrow().log, vec!["offer hola", "ctrl+v", "keep"]);
    }

    #[test]
    fn an_elevated_window_gets_no_keystroke_and_the_text_stays_in_the_clipboard() {
        let world = world(|world| world.elevated = true);
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::LeftInClipboard(Undelivered::Elevated)
        );
        assert_eq!(world.borrow().log, vec!["put hola"]);
    }

    #[test]
    fn a_window_switch_during_processing_pastes_nowhere_and_keeps_the_text() {
        let world = world(|world| {
            will_be_read(world);
            world.focus_moved = true;
        });
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::LeftInClipboard(Undelivered::FocusChanged)
        );
        assert_eq!(world.borrow().log, vec!["put hola"]);
    }

    #[test]
    fn a_clipboard_that_cannot_be_restored_is_reported_not_hidden() {
        let world = world(|world| {
            will_be_read(world);
            world.restore_fails = true;
        });
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::PastedClipboardLost
        );
        assert_eq!(world.borrow().log, vec!["offer hola", "ctrl+v", "restore"]);
    }

    #[test]
    fn a_busy_clipboard_fails_without_typing_anything() {
        let world = world(|world| world.offer_fails = true);
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::Failed
        );
        assert!(world.borrow().log.is_empty());
    }
}
