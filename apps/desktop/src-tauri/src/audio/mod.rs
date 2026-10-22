mod capture;
mod level;
mod microphone;
mod wav;

use std::sync::{Arc, Mutex, OnceLock, PoisonError};
use std::time::Duration;

use serde::Serialize;

pub use capture::{CaptureBuffer, Captured};
pub use level::Level;
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

type StatusListener = Box<dyn Fn(MicStatus) + Send + Sync>;

#[derive(Clone, Default)]
pub struct MicrophoneStatus {
    current: Arc<Mutex<MicStatus>>,
    listener: Arc<OnceLock<StatusListener>>,
}

impl MicrophoneStatus {
    pub fn get(&self) -> MicStatus {
        *self.current.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn on_change(&self, listener: impl Fn(MicStatus) + Send + Sync + 'static) {
        if self.listener.set(Box::new(listener)).is_err() {
            log::warn!("the microphone status already has a listener");
        }
    }

    fn record(&self, result: &Result<impl Sized, AudioError>) {
        self.set(MicStatus::of(result));
    }

    fn set(&self, status: MicStatus) {
        let previous = std::mem::replace(
            &mut *self.current.lock().unwrap_or_else(PoisonError::into_inner),
            status,
        );
        if previous != status
            && let Some(listener) = self.listener.get()
        {
            listener(status);
        }
    }
}

pub trait Capture {
    fn start(&mut self);
    fn stop(&mut self) -> Result<Captured, AudioError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_microphone_status_reports_each_change_once() {
        let status = MicrophoneStatus::default();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let heard = Arc::clone(&seen);
        status.on_change(move |change| heard.lock().unwrap().push(change));
        status.record(&Ok::<(), AudioError>(()));
        status.record(&Ok::<(), AudioError>(()));
        status.record(&Err::<(), _>(AudioError::PermissionDenied));
        status.record(&Err::<(), _>(AudioError::NoDevice));
        status.record(&Ok::<(), AudioError>(()));
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                MicStatus::Ready,
                MicStatus::Denied,
                MicStatus::Missing,
                MicStatus::Ready
            ]
        );
        assert_eq!(status.get(), MicStatus::Ready);
    }
}
