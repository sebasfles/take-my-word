#[cfg(not(windows))]
mod unsupported;
#[cfg(windows)]
mod win32;

use std::time::Duration;

#[cfg(not(windows))]
use unsupported::SystemClipboard;
#[cfg(windows)]
use win32::SystemClipboard;

#[derive(Debug, thiserror::Error)]
#[error("the clipboard is unavailable: {0}")]
pub struct ClipboardError(pub String);

#[derive(Clone, Copy, Debug)]
pub struct Settle {
    pub at_least: Duration,
    pub quiet: Duration,
    pub at_most: Duration,
}

impl Settle {
    pub fn after_the_read(grace: Duration) -> Self {
        Self {
            at_least: grace,
            quiet: grace,
            at_most: Duration::from_secs(1),
        }
    }
}

impl Default for Settle {
    fn default() -> Self {
        Self {
            at_least: Duration::from_millis(40),
            quiet: Duration::from_millis(30),
            at_most: Duration::from_millis(100),
        }
    }
}

#[cfg(any(windows, test))]
pub fn settled(
    settle: Settle,
    waited: Duration,
    rendering: bool,
    since_last_read: Option<Duration>,
) -> bool {
    waited >= settle.at_most
        || (waited >= settle.at_least
            && !rendering
            && since_last_read.is_none_or(|since| since >= settle.quiet))
}

#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ReadOrder {
    armed: bool,
    contended: bool,
    counted: bool,
    failed: bool,
}

#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReadOutcome {
    Counted,
    Contended,
    Failed,
    Ignored(Ignored),
}

#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ignored {
    BeforeTheKeystroke,
    AfterTheCount,
    AfterAContention,
    AfterAFailedRender,
}

#[cfg(any(windows, test))]
impl ReadOrder {
    pub fn arm(&mut self) {
        *self = Self {
            armed: true,
            ..Self::default()
        };
    }

    pub fn read(
        &mut self,
        is_target: impl FnOnce() -> bool,
        render: impl FnOnce() -> bool,
    ) -> ReadOutcome {
        if let Some(reason) = self.ignored() {
            return ReadOutcome::Ignored(reason);
        }
        if !is_target() {
            self.contended = true;
            return ReadOutcome::Contended;
        }
        if render() {
            self.counted = true;
            ReadOutcome::Counted
        } else {
            self.failed = true;
            ReadOutcome::Failed
        }
    }

    fn ignored(&self) -> Option<Ignored> {
        if !self.armed {
            Some(Ignored::BeforeTheKeystroke)
        } else if self.counted {
            Some(Ignored::AfterTheCount)
        } else if self.contended {
            Some(Ignored::AfterAContention)
        } else if self.failed {
            Some(Ignored::AfterAFailedRender)
        } else {
            None
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReadWait {
    Counted,
    Contended,
    Failed,
    Nothing,
}

pub trait Clipboard {
    fn offer(&mut self, text: &str, readers: &[u32]) -> Result<(), ClipboardError>;
    fn settle(&mut self, settle: Settle) -> Duration;
    fn arm(&mut self, attempt: u32);
    fn wait_for_read(&mut self, timeout: Duration) -> ReadWait;
    fn restore(&mut self) -> Result<(), ClipboardError>;
    fn keep_text(&mut self) -> Result<(), ClipboardError>;
    fn put_text(&mut self, text: &str) -> Result<(), ClipboardError>;
}

#[cfg(any(windows, test))]
const MAX_ANCESTRY: usize = 32;

#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reader {
    Window(u32),
    Sender(u32),
    Unproven,
}

#[cfg(any(windows, test))]
pub fn renders_for(
    reader: Reader,
    targets: &[u32],
    parent_of: impl Fn(u32) -> Option<u32>,
) -> bool {
    match reader {
        Reader::Window(pid) | Reader::Sender(pid) => reader_allowed(pid, targets, parent_of),
        Reader::Unproven => false,
    }
}

#[cfg(any(windows, test))]
pub fn reader_allowed(
    reader: u32,
    targets: &[u32],
    parent_of: impl Fn(u32) -> Option<u32>,
) -> bool {
    depth_below(reader, targets, parent_of).is_some()
}

#[cfg(any(windows, test))]
pub fn depth_below(
    reader: u32,
    targets: &[u32],
    parent_of: impl Fn(u32) -> Option<u32>,
) -> Option<usize> {
    let mut current = reader;
    for depth in 0..MAX_ANCESTRY {
        if current == 0 {
            return None;
        }
        if targets.contains(&current) {
            return Some(depth);
        }
        match parent_of(current) {
            Some(parent) if parent != current => current = parent,
            _ => return None,
        }
    }
    None
}

#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WaitNode {
    Thread { process: u32, thread: u32 },
    SendMessage,
    Other,
}

#[cfg(any(windows, test))]
pub fn probe_order(threads: &[(u32, u32)], depth: impl Fn(u32) -> usize) -> Vec<(u32, u32)> {
    let mut seen = std::collections::HashSet::new();
    let mut ordered = threads
        .iter()
        .enumerate()
        .map(|(index, &(process, thread))| {
            let secondary = !seen.insert(process);
            ((secondary, depth(process), index), (process, thread))
        })
        .collect::<Vec<_>>();
    ordered.sort_by_key(|(key, _)| *key);
    ordered.into_iter().map(|(_, thread)| thread).collect()
}

#[cfg(any(windows, test))]
pub fn sends_to(chain: &[WaitNode], receiver: u32) -> bool {
    matches!(
        chain,
        [
            WaitNode::Thread { .. },
            WaitNode::SendMessage,
            WaitNode::Thread { thread, .. },
            ..
        ] if *thread == receiver
    )
}

pub struct Unavailable(pub String);

impl Unavailable {
    fn error(&self) -> ClipboardError {
        ClipboardError(self.0.clone())
    }
}

impl Clipboard for Unavailable {
    fn offer(&mut self, _text: &str, _readers: &[u32]) -> Result<(), ClipboardError> {
        Err(self.error())
    }

    fn settle(&mut self, _settle: Settle) -> Duration {
        Duration::ZERO
    }

    fn arm(&mut self, _attempt: u32) {}

    fn wait_for_read(&mut self, _timeout: Duration) -> ReadWait {
        ReadWait::Nothing
    }

    fn restore(&mut self) -> Result<(), ClipboardError> {
        Err(self.error())
    }

    fn keep_text(&mut self) -> Result<(), ClipboardError> {
        Err(self.error())
    }

    fn put_text(&mut self, _text: &str) -> Result<(), ClipboardError> {
        Err(self.error())
    }
}

pub fn system() -> Box<dyn Clipboard + Send> {
    match SystemClipboard::spawn() {
        Ok(clipboard) => Box::new(clipboard),
        Err(error) => {
            log::error!("{error}");
            Box::new(Unavailable(error.0))
        }
    }
}

impl<C: Clipboard + ?Sized> Clipboard for Box<C> {
    fn offer(&mut self, text: &str, readers: &[u32]) -> Result<(), ClipboardError> {
        (**self).offer(text, readers)
    }

    fn settle(&mut self, settle: Settle) -> Duration {
        (**self).settle(settle)
    }

    fn arm(&mut self, attempt: u32) {
        (**self).arm(attempt);
    }

    fn wait_for_read(&mut self, timeout: Duration) -> ReadWait {
        (**self).wait_for_read(timeout)
    }

    fn restore(&mut self) -> Result<(), ClipboardError> {
        (**self).restore()
    }

    fn keep_text(&mut self) -> Result<(), ClipboardError> {
        (**self).keep_text()
    }

    fn put_text(&mut self, text: &str) -> Result<(), ClipboardError> {
        (**self).put_text(text)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn tree() -> HashMap<u32, u32> {
        HashMap::from([
            (100, 4),
            (200, 100),
            (300, 200),
            (310, 200),
            (900, 4),
            (950, 900),
        ])
    }

    #[test]
    fn the_target_and_every_process_it_spawned_may_read() {
        let parents = tree();
        let parent_of = |pid| parents.get(&pid).copied();
        assert!(reader_allowed(100, &[100], parent_of));
        assert!(reader_allowed(200, &[100], parent_of));
        assert!(reader_allowed(310, &[100], parent_of));
    }

    #[test]
    fn unrelated_readers_and_the_targets_parents_may_not() {
        let parents = tree();
        let parent_of = |pid| parents.get(&pid).copied();
        assert!(!reader_allowed(950, &[100], parent_of));
        assert!(!reader_allowed(4, &[100], parent_of));
        assert!(!reader_allowed(123, &[100], parent_of));
    }

    #[test]
    fn a_parent_loop_ends_the_walk() {
        let parents = HashMap::from([(1, 2), (2, 1)]);
        assert!(!reader_allowed(1, &[100], |pid| parents.get(&pid).copied()));
    }

    #[test]
    fn a_windowless_reader_nobody_can_place_never_gets_the_text() {
        let parents = tree();
        assert!(!renders_for(Reader::Unproven, &[100], |pid| parents
            .get(&pid)
            .copied()));
    }

    #[test]
    fn a_windowless_read_counts_only_when_its_sending_thread_belongs_to_the_target() {
        let parents = tree();
        let parent_of = |pid| parents.get(&pid).copied();
        assert!(renders_for(Reader::Sender(310), &[100], parent_of));
        assert!(!renders_for(Reader::Sender(950), &[100], parent_of));
    }

    #[test]
    fn without_a_target_nobody_reads_the_text() {
        let parents = tree();
        let parent_of = |pid| parents.get(&pid).copied();
        assert!(!renders_for(Reader::Window(100), &[], parent_of));
        assert!(!renders_for(Reader::Window(0), &[], parent_of));
        assert!(!renders_for(Reader::Window(0), &[100], parent_of));
    }

    #[test]
    fn a_thread_sending_straight_to_the_clipboard_thread_is_the_reader() {
        let sender = WaitNode::Thread {
            process: 310,
            thread: 41,
        };
        let receiver = WaitNode::Thread {
            process: 7,
            thread: 99,
        };
        assert!(sends_to(&[sender, WaitNode::SendMessage, receiver], 99));
        assert!(!sends_to(&[sender, WaitNode::SendMessage, receiver], 98));
        assert!(!sends_to(&[sender, WaitNode::Other, receiver], 99));
        assert!(!sends_to(&[sender], 99));
        assert!(!sends_to(&[], 99));
    }

    #[test]
    fn the_targets_own_main_threads_are_probed_first_then_deeper_processes() {
        let depths = HashMap::from([(10, 1), (20, 0), (30, 2)]);
        let depth = |pid| depths[&pid];
        let threads = [(10, 1), (10, 2), (20, 3), (10, 4), (20, 5), (30, 6)];
        assert_eq!(
            probe_order(&threads, depth),
            vec![(20, 3), (10, 1), (30, 6), (20, 5), (10, 2), (10, 4)]
        );
    }

    #[test]
    fn the_depth_below_the_target_counts_parent_steps() {
        let parents = tree();
        let parent_of = |pid| parents.get(&pid).copied();
        assert_eq!(depth_below(100, &[100], parent_of), Some(0));
        assert_eq!(depth_below(310, &[100], parent_of), Some(2));
        assert_eq!(depth_below(950, &[100], parent_of), None);
    }

    fn never() -> bool {
        panic!("must not run");
    }

    #[test]
    fn no_read_before_the_keystroke_can_count_not_even_the_targets() {
        let mut order = ReadOrder::default();
        assert_eq!(
            order.read(never, never),
            ReadOutcome::Ignored(Ignored::BeforeTheKeystroke)
        );
        order.arm();
        assert_eq!(order.read(|| true, || true), ReadOutcome::Counted);
    }

    #[test]
    fn the_first_read_after_the_keystroke_counts_when_it_is_the_target_and_renders() {
        let mut order = ReadOrder::default();
        order.arm();
        assert_eq!(order.read(|| true, || true), ReadOutcome::Counted);
    }

    #[test]
    fn once_a_read_counted_later_requests_of_the_same_paste_are_neither_probed_nor_rendered() {
        let mut order = ReadOrder::default();
        order.arm();
        assert_eq!(order.read(|| true, || true), ReadOutcome::Counted);
        assert_eq!(
            order.read(never, never),
            ReadOutcome::Ignored(Ignored::AfterTheCount)
        );
    }

    #[test]
    fn a_target_read_after_another_reader_after_the_keystroke_is_never_probed_or_counted() {
        let mut order = ReadOrder::default();
        order.arm();
        assert_eq!(order.read(|| false, never), ReadOutcome::Contended);
        assert_eq!(
            order.read(never, never),
            ReadOutcome::Ignored(Ignored::AfterAContention)
        );
    }

    #[test]
    fn a_render_that_fails_never_counts_and_ends_the_paste() {
        let mut order = ReadOrder::default();
        order.arm();
        assert_eq!(order.read(|| true, || false), ReadOutcome::Failed);
        assert_eq!(
            order.read(never, never),
            ReadOutcome::Ignored(Ignored::AfterAFailedRender)
        );
    }

    #[test]
    fn a_retry_rearms_the_order_so_its_first_read_can_count_again() {
        let mut order = ReadOrder::default();
        order.arm();
        assert_eq!(order.read(|| false, never), ReadOutcome::Contended);
        order.arm();
        assert_eq!(order.read(|| true, || true), ReadOutcome::Counted);
    }

    #[test]
    fn the_keystroke_waits_for_readers_reacting_to_the_offer_but_never_past_the_cap() {
        let settle = Settle::default();
        let ms = Duration::from_millis;
        assert!(!settled(settle, ms(10), false, None));
        assert!(settled(settle, ms(40), false, None));
        assert!(!settled(settle, ms(60), true, Some(ms(50))));
        assert!(!settled(settle, ms(60), false, Some(ms(10))));
        assert!(settled(settle, ms(60), false, Some(ms(30))));
        assert!(settled(settle, ms(100), true, Some(ms(0))));
    }

    #[test]
    fn a_thread_only_waiting_on_the_real_sender_is_not_the_reader() {
        let waiter = WaitNode::Thread {
            process: 310,
            thread: 41,
        };
        let monitor = WaitNode::Thread {
            process: 950,
            thread: 52,
        };
        let receiver = WaitNode::Thread {
            process: 7,
            thread: 99,
        };
        assert!(!sends_to(
            &[
                waiter,
                WaitNode::Other,
                monitor,
                WaitNode::SendMessage,
                receiver
            ],
            99
        ));
    }
}
