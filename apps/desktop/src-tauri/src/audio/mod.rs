mod capture;
mod microphone;
mod wav;

use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use serde::Serialize;

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
    #[error("the microphone sent only digital silence")]
    NoSignal,
    #[error("the microphone failed: {0}")]
    Device(String),
    #[error("the recording was never started")]
    NotStarted,
    #[error("encoding the recording failed: {0}")]
    Encode(String),
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MicStatus {
    #[default]
    Unknown,
    Ready,
    Denied,
    Missing,
    Failing,
}

impl MicStatus {
    fn of(result: &Result<impl Sized, AudioError>) -> Self {
        match result {
            Ok(_) => Self::Ready,
            Err(AudioError::PermissionDenied) => Self::Denied,
            Err(AudioError::NoDevice) => Self::Missing,
            Err(_) => Self::Failing,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct MicrophoneStatus(Arc<Mutex<MicStatus>>);

impl MicrophoneStatus {
    pub fn get(&self) -> MicStatus {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn record(&self, result: &Result<impl Sized, AudioError>) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = MicStatus::of(result);
    }
}

pub trait Capture {
    fn start(&mut self);
    fn stop(&mut self) -> Result<Captured, AudioError>;
}
