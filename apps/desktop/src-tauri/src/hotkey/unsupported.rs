use std::sync::Arc;

use super::hook::{HookError, KeyHook, KeySink};

pub fn install(_sink: KeySink) -> Result<Arc<dyn KeyHook + Send + Sync>, HookError> {
    Err(HookError("not supported on this platform yet".into()))
}

pub fn key_name(code: u32) -> String {
    format!("Key {code}")
}

pub fn key_code_from_dom(_code: &str) -> Option<u32> {
    None
}
