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

pub trait KeyHook {
    fn guard_start_menu(&self);
    fn is_held(&self, key: Key) -> bool;
}

#[derive(Debug, thiserror::Error)]
#[error("the keyboard hook is unavailable: {0}")]
pub struct HookError(pub String);

pub type KeySink = Box<dyn FnMut(KeyEvent, &dyn KeyHook) + Send>;

pub fn install(sink: KeySink) -> Result<Arc<dyn KeyHook + Send + Sync>, HookError> {
    platform::install(sink)
}

pub fn key_name(code: u32) -> String {
    platform::key_name(code)
}

pub fn key_code_from_dom(code: &str) -> Option<u32> {
    platform::key_code_from_dom(code)
}
