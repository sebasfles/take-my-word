use std::sync::Arc;

use super::hook::{HookError, KeyHook, KeySink};

pub fn install(_sink: KeySink) -> Result<Arc<dyn KeyHook>, HookError> {
    Err(HookError("not supported on this platform yet".into()))
}
