use std::collections::HashMap;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use crate::api::PasteKeystroke;
use crate::dictation::Paste;
use crate::paste::{PasteResult, Undelivered};

pub const ACK_TIMEOUT: Duration = Duration::from_secs(1);

pub trait Page {
    fn main_window(&self) -> Option<isize>;
    fn insert(&self, id: u64, text: &str) -> bool;
}

pub trait Keeper {
    fn keep(&self, text: &str) -> bool;
}

#[derive(Clone, Default)]
pub struct Acks(Arc<Mutex<HashMap<u64, Sender<bool>>>>);

impl Acks {
    fn expect(&self, id: u64) -> mpsc::Receiver<bool> {
        let (sender, receiver) = mpsc::channel();
        self.lock().insert(id, sender);
        receiver
    }

    fn forget(&self, id: u64) {
        self.lock().remove(&id);
    }

    pub fn answer(&self, id: u64, inserted: bool) {
        if let Some(sender) = self.lock().remove(&id) {
            let _ = sender.send(inserted);
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<u64, Sender<bool>>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

pub struct OwnWindowFirst<G, K, P> {
    pub page: G,
    pub keeper: K,
    pub acks: Acks,
    pub others: P,
    pub timeout: Duration,
    pub next_id: u64,
}

impl<G: Page, K: Keeper, P: Paste> Paste for OwnWindowFirst<G, K, P> {
    fn paste(
        &mut self,
        text: &str,
        target: Option<isize>,
        keystroke: PasteKeystroke,
    ) -> PasteResult {
        if target.is_none() || target != self.page.main_window() {
            return self.others.paste(text, target, keystroke);
        }
        self.next_id += 1;
        let id = self.next_id;
        let answer = self.acks.expect(id);
        let inserted = self.page.insert(id, text)
            && answer.recv_timeout(self.timeout).unwrap_or(false);
        self.acks.forget(id);
        if inserted {
            log::info!("inserted a dictation into the main window");
            return PasteResult::Pasted;
        }
        log::info!("the main window did not insert the dictation, keeping it in the clipboard");
        if self.keeper.keep(text) {
            PasteResult::LeftInClipboard(Undelivered::NotRead)
        } else {
            PasteResult::Failed
        }
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::thread;

    use super::*;

    const MAIN: isize = 0x2670;

    #[derive(Default)]
    struct Seen {
        inserts: Vec<(u64, String)>,
        kept: Vec<String>,
        pasted_elsewhere: Vec<String>,
    }

    struct FakePage {
        seen: Rc<RefCell<Seen>>,
        acks: Acks,
        reply: Option<bool>,
    }

    impl Page for FakePage {
        fn main_window(&self) -> Option<isize> {
            Some(MAIN)
        }

        fn insert(&self, id: u64, text: &str) -> bool {
            self.seen.borrow_mut().inserts.push((id, text.into()));
            if let Some(inserted) = self.reply {
                let acks = self.acks.clone();
                thread::spawn(move || acks.answer(id, inserted));
            }
            true
        }
    }

    struct FakeKeeper(Rc<RefCell<Seen>>);

    impl Keeper for FakeKeeper {
        fn keep(&self, text: &str) -> bool {
            self.0.borrow_mut().kept.push(text.into());
            true
        }
    }

    struct Elsewhere(Rc<RefCell<Seen>>);

    impl Paste for Elsewhere {
        fn paste(
            &mut self,
            text: &str,
            _target: Option<isize>,
            _keystroke: PasteKeystroke,
        ) -> PasteResult {
            self.0.borrow_mut().pasted_elsewhere.push(text.into());
            PasteResult::Pasted
        }
    }

    type Own = OwnWindowFirst<FakePage, FakeKeeper, Elsewhere>;

    fn own(reply: Option<bool>) -> (Own, Rc<RefCell<Seen>>) {
        let seen = Rc::new(RefCell::new(Seen::default()));
        let acks = Acks::default();
        let paste = OwnWindowFirst {
            page: FakePage {
                seen: Rc::clone(&seen),
                acks: acks.clone(),
                reply,
            },
            keeper: FakeKeeper(Rc::clone(&seen)),
            acks,
            others: Elsewhere(Rc::clone(&seen)),
            timeout: Duration::from_millis(200),
            next_id: 0,
        };
        (paste, seen)
    }

    #[test]
    fn a_dictation_for_the_main_window_counts_as_pasted_only_on_an_inserted_ack() {
        let (mut paste, seen) = own(Some(true));
        assert_eq!(
            paste.paste("hola", Some(MAIN), PasteKeystroke::CtrlV),
            PasteResult::Pasted
        );
        assert_eq!(seen.borrow().inserts, vec![(1, "hola".to_string())]);
        assert!(seen.borrow().kept.is_empty());
    }

    #[test]
    fn without_an_ack_or_with_a_refusal_the_text_stays_in_the_clipboard() {
        for reply in [None, Some(false)] {
            let (mut paste, seen) = own(reply);
            assert_eq!(
                paste.paste("hola", Some(MAIN), PasteKeystroke::CtrlV),
                PasteResult::LeftInClipboard(Undelivered::NotRead),
                "{reply:?}"
            );
            assert_eq!(seen.borrow().kept, vec!["hola".to_string()]);
        }
    }

    #[test]
    fn other_windows_keep_the_clipboard_paste() {
        let (mut paste, seen) = own(Some(true));
        assert_eq!(
            paste.paste("hola", Some(0x1280), PasteKeystroke::CtrlV),
            PasteResult::Pasted
        );
        assert!(seen.borrow().inserts.is_empty());
        assert_eq!(seen.borrow().pasted_elsewhere, vec!["hola".to_string()]);
    }

    #[test]
    fn a_late_ack_for_an_earlier_dictation_is_ignored() {
        let acks = Acks::default();
        acks.answer(7, true);
        let waiting = acks.expect(8);
        acks.answer(7, true);
        assert!(waiting.recv_timeout(Duration::from_millis(50)).is_err());
    }
}
