use std::thread;
use std::time::{Duration, Instant};

use enigo::{Direction, Enigo, Keyboard, Settings};

use crate::api::PasteKeystroke;
use crate::clipboard::{Clipboard, ReadWait, Settle};
use crate::foreground::ActiveWindow;
use crate::hotkey::OWN_INJECTION_TAG;

const ATTEMPTS: u32 = 2;

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
    pub settle: Settle,
}

impl Default for Timing {
    fn default() -> Self {
        Self {
            release_poll: Duration::from_millis(10),
            release_timeout: Duration::from_secs(30),
            read_timeout: Duration::from_millis(1500),
            read_grace: Duration::from_millis(150),
            settle: Settle::default(),
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
        if let Some(reason) = self.blocked(target) {
            return self.leave(text, reason);
        }
        let readers = target.map_or_else(Vec::new, |window| self.window.reader_processes(window));
        if let Err(error) = self.clipboard.offer(text, &readers) {
            log::warn!("{error}");
            return PasteResult::Failed;
        }
        let settled = self.clipboard.settle(self.timing.settle);
        log::info!(
            "offered the dictation to {} target processes, settled {} ms",
            readers.len(),
            settled.as_millis()
        );
        let mut attempt = 1;
        loop {
            self.clipboard.arm(attempt);
            if let Err(error) = self.keystroke.paste(keystroke) {
                log::warn!("the paste keystroke failed: {error}");
                return self.keep(Undelivered::NotRead);
            }
            log::info!("sent the paste keystroke, attempt {attempt}");
            match self.clipboard.wait_for_read(self.timing.read_timeout) {
                ReadWait::Counted => break,
                ReadWait::Contended if attempt < ATTEMPTS => {
                    let settled = self.clipboard.settle(self.timing.settle);
                    if let Some(reason) = self.blocked(target) {
                        return self.keep(reason);
                    }
                    log::info!(
                        "attempt {attempt} was contended, settled {} ms before the next",
                        settled.as_millis()
                    );
                    attempt += 1;
                }
                ReadWait::Contended | ReadWait::Failed | ReadWait::Nothing => {
                    return self.keep(Undelivered::NotRead);
                }
            }
        }
        let settle = Settle::after_the_read(self.timing.read_grace);
        let waited = self.clipboard.settle(settle);
        log::info!(
            "restoring {} ms after the counted read, {}",
            waited.as_millis(),
            if waited >= settle.at_most {
                "at the cap with readers still active"
            } else {
                "after the readers went quiet"
            }
        );
        match self.clipboard.restore() {
            Ok(()) => PasteResult::Pasted,
            Err(error) => {
                log::warn!("restoring the clipboard failed: {error}");
                PasteResult::PastedClipboardLost
            }
        }
    }

    fn blocked(&self, target: Option<isize>) -> Option<Undelivered> {
        if !self.wait_for_release() {
            return Some(Undelivered::KeysHeld);
        }
        let foreground = self.window.foreground();
        if foreground.window != target {
            return Some(Undelivered::FocusChanged);
        }
        foreground.elevated.then_some(Undelivered::Elevated)
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

    fn keep(&mut self, reason: Undelivered) -> PasteResult {
        match self.clipboard.keep_text() {
            Ok(()) => PasteResult::LeftInClipboard(reason),
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
    use std::collections::VecDeque;
    use std::rc::Rc;

    use super::*;
    use crate::clipboard::ClipboardError;
    use crate::foreground::ForegroundApp;

    #[derive(Default)]
    struct World {
        log: Vec<String>,
        reads: VecDeque<ReadWait>,
        keystrokes: u32,
        focus_moves_after_keystroke: bool,
        keystroke_fails: bool,
        offer_fails: bool,
        restore_fails: bool,
        elevated: bool,
        focus_moved: bool,
        held_polls: Cell<u32>,
        readers: Vec<u32>,
    }

    type Shared = Rc<RefCell<World>>;

    struct FakeClipboard(Shared);

    impl Clipboard for FakeClipboard {
        fn offer(&mut self, text: &str, readers: &[u32]) -> Result<(), ClipboardError> {
            if self.0.borrow().offer_fails {
                return Err(ClipboardError("busy".into()));
            }
            self.0.borrow_mut().readers = readers.to_vec();
            self.0.borrow_mut().log.push(format!("offer {text}"));
            Ok(())
        }

        fn settle(&mut self, _settle: Settle) -> Duration {
            self.0.borrow_mut().log.push("settle".into());
            Duration::ZERO
        }

        fn arm(&mut self, attempt: u32) {
            self.0.borrow_mut().log.push(format!("arm {attempt}"));
        }

        fn wait_for_read(&mut self, _timeout: Duration) -> ReadWait {
            let read = self.0.borrow_mut().reads.pop_front();
            let read = read.unwrap_or(ReadWait::Nothing);
            self.0.borrow_mut().log.push(format!("{read:?}"));
            read
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
            world.keystrokes += 1;
            Ok(())
        }
    }

    struct FakeWindow(Shared);

    impl ActiveWindow for FakeWindow {
        fn foreground(&self) -> ForegroundApp {
            let world = self.0.borrow();
            let moved =
                world.focus_moved || (world.focus_moves_after_keystroke && world.keystrokes > 0);
            ForegroundApp {
                window: Some(if moved { 2 } else { 1 }),
                app_id: Some("notepad.exe".into()),
                elevated: self.0.borrow().elevated,
            }
        }

        fn reader_processes(&self, window: isize) -> Vec<u32> {
            vec![u32::try_from(window).unwrap() * 100, 7]
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
                settle: Settle::default(),
            },
        }
    }

    fn world(setup: impl FnOnce(&mut World)) -> Shared {
        let mut world = World::default();
        setup(&mut world);
        Rc::new(RefCell::new(world))
    }

    fn will_be_read(world: &mut World) {
        world.reads = VecDeque::from([ReadWait::Counted]);
    }

    #[test]
    fn the_clipboard_is_restored_only_after_the_target_read_the_text() {
        let world = world(will_be_read);
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::Pasted
        );
        assert_eq!(
            world.borrow().log,
            vec![
                "offer hola",
                "settle",
                "arm 1",
                "ctrl+v",
                "Counted",
                "settle",
                "restore"
            ]
        );
    }

    #[test]
    fn only_the_target_app_may_read_the_offered_text() {
        let world = world(will_be_read);
        paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV);
        assert_eq!(world.borrow().readers, vec![100, 7]);
    }

    #[test]
    fn the_paste_sends_the_keystroke_it_is_given() {
        let world = world(will_be_read);
        let pasted = paster(&world).paste("hola", Some(1), PasteKeystroke::ShiftInsert);
        assert_eq!(pasted, PasteResult::Pasted);
        assert_eq!(
            world.borrow().log,
            vec![
                "offer hola",
                "settle",
                "arm 1",
                "shift+insert",
                "Counted",
                "settle",
                "restore"
            ]
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
            vec![
                "held",
                "held",
                "held",
                "offer hola",
                "settle",
                "arm 1",
                "ctrl+v",
                "Counted",
                "settle",
                "restore"
            ]
        );
    }

    #[test]
    fn text_nobody_reads_stays_in_the_clipboard() {
        let world = world(|_| {});
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::LeftInClipboard(Undelivered::NotRead)
        );
        assert_eq!(
            world.borrow().log,
            vec!["offer hola", "settle", "arm 1", "ctrl+v", "Nothing", "keep"]
        );
    }

    #[test]
    fn a_contended_first_keystroke_is_retried_once_and_the_second_can_land() {
        let world = world(|world| {
            world.reads = VecDeque::from([ReadWait::Contended, ReadWait::Counted]);
        });
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::Pasted
        );
        assert_eq!(
            world.borrow().log,
            vec![
                "offer hola",
                "settle",
                "arm 1",
                "ctrl+v",
                "Contended",
                "settle",
                "arm 2",
                "ctrl+v",
                "Counted",
                "settle",
                "restore"
            ]
        );
    }

    #[test]
    fn a_second_contention_leaves_the_text_without_a_third_keystroke() {
        let world = world(|world| {
            world.reads = VecDeque::from([ReadWait::Contended, ReadWait::Contended]);
        });
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::LeftInClipboard(Undelivered::NotRead)
        );
        assert_eq!(world.borrow().keystrokes, 2);
        assert_eq!(world.borrow().log.last().map(String::as_str), Some("keep"));
    }

    #[test]
    fn a_render_that_failed_keeps_the_text_without_a_retry_or_a_restore() {
        let world = world(|world| {
            world.reads = VecDeque::from([ReadWait::Failed, ReadWait::Counted]);
        });
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::LeftInClipboard(Undelivered::NotRead)
        );
        assert_eq!(
            world.borrow().log,
            vec!["offer hola", "settle", "arm 1", "ctrl+v", "Failed", "keep"]
        );
    }

    #[test]
    fn focus_lost_before_the_retry_keeps_the_text_without_a_second_keystroke() {
        let world = world(|world| {
            world.reads = VecDeque::from([ReadWait::Contended, ReadWait::Counted]);
            world.focus_moves_after_keystroke = true;
        });
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::LeftInClipboard(Undelivered::FocusChanged)
        );
        assert_eq!(world.borrow().keystrokes, 1);
        assert_eq!(world.borrow().log.last().map(String::as_str), Some("keep"));
    }

    #[test]
    fn a_failed_keystroke_leaves_the_text_in_the_clipboard() {
        let world = world(|world| world.keystroke_fails = true);
        assert_eq!(
            paster(&world).paste("hola", Some(1), PasteKeystroke::CtrlV),
            PasteResult::LeftInClipboard(Undelivered::NotRead)
        );
        assert_eq!(
            world.borrow().log,
            vec!["offer hola", "settle", "arm 1", "ctrl+v", "keep"]
        );
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
        assert_eq!(
            world.borrow().log,
            vec![
                "offer hola",
                "settle",
                "arm 1",
                "ctrl+v",
                "Counted",
                "settle",
                "restore"
            ]
        );
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
