use std::sync::Arc;

use super::Key;
#[cfg(not(windows))]
use super::unsupported as platform;
#[cfg(windows)]
use super::win32 as platform;

pub const OWN_INJECTION_TAG: usize = 0x544D_5721;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct KeyEvent {
    pub key: Key,
    pub down: bool,
}

pub trait KeyHook: Send + Sync {
    fn guard_start_menu(&self);
    fn is_held(&self, key: Key) -> bool;
}

#[derive(Debug, thiserror::Error)]
#[error("the keyboard hook is unavailable: {0}")]
pub struct HookError(pub String);

pub type KeySink = Box<dyn Fn(KeyEvent) + Send>;

pub fn install(sink: KeySink) -> Result<Arc<dyn KeyHook>, HookError> {
    platform::install(sink)
}
