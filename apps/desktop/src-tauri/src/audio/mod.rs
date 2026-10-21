mod capture;
mod microphone;
mod wav;

use std::time::Duration;

pub use capture::{CaptureBuffer, Captured};
pub use microphone::Microphone;
pub use wav::encode_wav;

pub const MAX_RECORDING: Duration = Duration::from_secs(120);
pub const MIN_RECORDING: Duration = Duration::from_millis(500);

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("no microphone was found")]
    NoDevice,
    #[error("the system denied access to the microphone")]
    PermissionDenied,
    #[error("the microphone failed: {0}")]
    Device(String),
    #[error("the recording was never started")]
    NotStarted,
    #[error("encoding the recording failed: {0}")]
    Encode(String),
}

pub trait Capture {
    fn start(&mut self);
    fn stop(&mut self) -> Result<Captured, AudioError>;
}
