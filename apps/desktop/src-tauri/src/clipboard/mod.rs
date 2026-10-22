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
