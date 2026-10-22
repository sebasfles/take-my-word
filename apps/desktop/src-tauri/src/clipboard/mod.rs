#[cfg(not(windows))]
mod unsupported;
#[cfg(windows)]
mod win32;

use std::time::{Duration, Instant};

#[cfg(not(windows))]
use unsupported::SystemClipboard;
#[cfg(windows)]
use win32::SystemClipboard;

#[derive(Debug, thiserror::Error)]
#[error("the clipboard is unavailable: {0}")]
pub struct ClipboardError(pub String);

pub trait Clipboard {
    fn offer(&mut self, text: &str, readers: &[u32]) -> Result<(), ClipboardError>;
    fn wait_for_read(&mut self, timeout: Duration) -> Option<Instant>;
    fn restore(&mut self) -> Result<(), ClipboardError>;
    fn keep_text(&mut self) -> Result<(), ClipboardError>;
    fn put_text(&mut self, text: &str) -> Result<(), ClipboardError>;
}

#[cfg(any(windows, test))]
const MAX_ANCESTRY: usize = 32;

#[cfg(any(windows, test))]
pub fn reader_allowed(
    reader: u32,
    targets: &[u32],
    parent_of: impl Fn(u32) -> Option<u32>,
) -> bool {
    let mut current = reader;
    for _ in 0..MAX_ANCESTRY {
        if targets.contains(&current) {
            return true;
        }
        match parent_of(current) {
            Some(parent) if parent != 0 && parent != current => current = parent,
            _ => return false,
        }
    }
    false
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

    fn wait_for_read(&mut self, _timeout: Duration) -> Option<Instant> {
        None
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

    fn wait_for_read(&mut self, timeout: Duration) -> Option<Instant> {
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
}
