use super::{ClipboardError, Unavailable};

pub struct SystemClipboard;

impl SystemClipboard {
    pub fn spawn() -> Result<Unavailable, ClipboardError> {
        Err(ClipboardError("not supported on this platform yet".into()))
    }
}
