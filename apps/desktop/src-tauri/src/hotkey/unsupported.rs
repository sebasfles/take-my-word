use super::hook::{HookError, KeySink};

pub fn install(_sink: KeySink) -> Result<(), HookError> {
    Err(HookError("not supported on this platform yet".into()))
}
