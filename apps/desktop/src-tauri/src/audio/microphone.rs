use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError, mpsc};
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{ErrorKind, FromSample, SampleFormat, SizedSample, Stream, StreamConfig};

use super::level::Meter;
use super::{AudioError, Capture, CaptureBuffer, Captured, Level, MicrophoneStatus};

enum Command {
    Start,
    Monitor(bool),
    Stop(mpsc::Sender<Result<Captured, AudioError>>),
}

pub struct Microphone {
    commands: mpsc::Sender<Command>,
    status: MicrophoneStatus,
    level: Level,
}

impl Microphone {
    pub fn spawn() -> Result<Self, AudioError> {
        let (commands, inbox) = mpsc::channel();
        let status = MicrophoneStatus::default();
        let reported = status.clone();
        let level = Level::default();
        let metered = level.clone();
        thread::Builder::new()
            .name("microphone".into())
            .spawn(move || serve(inbox, &reported, &metered))
            .map_err(|error| AudioError::Device(error.to_string()))?;
        Ok(Self {
            commands,
            status,
            level,
        })
    }

    pub fn level(&self) -> Level {
        self.level.clone()
    }

    pub fn status(&self) -> MicrophoneStatus {
        self.status.clone()
    }
}

impl Capture for Microphone {
    fn start(&mut self) {
        let _ = self.commands.send(Command::Start);
    }

    fn monitor(&mut self, on: bool) {
        let _ = self.commands.send(Command::Monitor(on));
    }

    fn stop(&mut self) -> Result<Captured, AudioError> {
        let gone = || AudioError::Device("the microphone thread stopped".into());
        let (reply, answer) = mpsc::channel();
        self.commands
            .send(Command::Stop(reply))
            .map_err(|_| gone())?;
        answer.recv().map_err(|_| gone())?
    }
}

type SharedBuffer = Arc<Mutex<CaptureBuffer>>;
type SharedFailure = Arc<Mutex<Option<AudioError>>>;

struct Armed {
    stream: Stream,
    buffer: SharedBuffer,
    failure: SharedFailure,
    keep: Arc<AtomicBool>,
}

impl Armed {
    fn new(level: &Level) -> Result<Self, AudioError> {
        let device = cpal::default_host()
            .default_input_device()
            .ok_or(AudioError::NoDevice)?;
        let supported = device.default_input_config().map_err(device_error)?;
        let config = supported.config();
        let buffer = Arc::new(Mutex::new(CaptureBuffer::new(
            config.channels,
            config.sample_rate,
        )));
        let failure = Arc::new(Mutex::new(None));
        let keep = Arc::new(AtomicBool::new(true));
        let shared = Shared {
            buffer: &buffer,
            failure: &failure,
            keep: &keep,
            level,
        };
        let stream = match supported.sample_format() {
            SampleFormat::F32 => build::<f32>(&device, config, &shared),
            SampleFormat::F64 => build::<f64>(&device, config, &shared),
            SampleFormat::I16 => build::<i16>(&device, config, &shared),
            SampleFormat::I32 => build::<i32>(&device, config, &shared),
            SampleFormat::I8 => build::<i8>(&device, config, &shared),
            SampleFormat::U16 => build::<u16>(&device, config, &shared),
            SampleFormat::U8 => build::<u8>(&device, config, &shared),
            other => Err(AudioError::Device(format!(
                "unsupported sample format {other}"
            ))),
        }?;
        Ok(Self {
            stream,
            buffer,
            failure,
            keep,
        })
    }

    fn keeping(self, keep: bool) -> Self {
        self.keep.store(keep, Ordering::Relaxed);
        if keep {
            self.buffer
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .take();
        }
        self
    }

    fn healthy(&self) -> bool {
        self.failure
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .is_none()
    }

    fn play(self) -> Result<Self, AudioError> {
        self.stream.play().map_err(device_error)?;
        Ok(self)
    }

    fn finish(self) -> Result<Captured, AudioError> {
        drop(self.stream);
        if let Some(error) = self
            .failure
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
        {
            return Err(error);
        }
        Ok(self
            .buffer
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take())
    }
}

fn arm(status: &MicrophoneStatus, level: &Level) -> Option<Armed> {
    let armed = Armed::new(level);
    status.record(&armed);
    armed
        .inspect_err(|error| log::warn!("preparing the microphone failed: {error}"))
        .ok()
}

fn play(armed: &mut Option<Armed>, level: &Level, keep: bool) -> Result<Armed, AudioError> {
    level.set(0.0);
    match armed.take().filter(Armed::healthy) {
        Some(ready) => ready
            .keeping(keep)
            .play()
            .or_else(|_| Armed::new(level)?.keeping(keep).play()),
        None => Armed::new(level).and_then(|fresh| fresh.keeping(keep).play()),
    }
}

fn serve(inbox: mpsc::Receiver<Command>, status: &MicrophoneStatus, level: &Level) {
    let mut armed = arm(status, level);
    let mut recording: Option<Result<Armed, AudioError>> = None;
    let mut monitoring: Option<Armed> = None;
    for command in inbox {
        match command {
            Command::Start => {
                if recording.is_none() {
                    let started = match monitoring.take() {
                        Some(live) if live.healthy() => Ok(live.keeping(true)),
                        _ => play(&mut armed, level, true),
                    };
                    status.record(&started);
                    recording = Some(started);
                }
            }
            Command::Monitor(true) => {
                if recording.is_none() && monitoring.is_none() {
                    let started = play(&mut armed, level, false);
                    status.record(&started);
                    monitoring = started
                        .inspect_err(|error| log::warn!("checking the microphone failed: {error}"))
                        .ok();
                }
            }
            Command::Monitor(false) => {
                if monitoring.take().is_some() {
                    level.set(0.0);
                    armed = arm(status, level);
                }
            }
            Command::Stop(reply) => {
                let result = match recording.take() {
                    Some(Ok(recording)) => recording.finish(),
                    Some(Err(error)) => Err(error),
                    None => Err(AudioError::NotStarted),
                };
                level.set(0.0);
                let _ = reply.send(result);
                armed = arm(status, level);
            }
        }
    }
}

struct Shared<'a> {
    buffer: &'a SharedBuffer,
    failure: &'a SharedFailure,
    keep: &'a Arc<AtomicBool>,
    level: &'a Level,
}

fn build<T>(
    device: &cpal::Device,
    config: StreamConfig,
    shared: &Shared<'_>,
) -> Result<Stream, AudioError>
where
    T: SizedSample + Send + 'static,
    f32: FromSample<T>,
{
    let buffer = Arc::clone(shared.buffer);
    let failure = Arc::clone(shared.failure);
    let keep = Arc::clone(shared.keep);
    let level = shared.level.clone();
    let mut meter = Meter::new(config.channels, config.sample_rate);
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let metered = data.iter().map(|sample| {
                    let sample = sample.to_sample::<f32>();
                    if let Some(value) = meter.push(sample) {
                        level.set(value);
                    }
                    sample
                });
                if keep.load(Ordering::Relaxed) {
                    buffer
                        .lock()
                        .unwrap_or_else(PoisonError::into_inner)
                        .extend(metered);
                } else {
                    metered.for_each(drop);
                }
            },
            move |error: cpal::Error| match error.kind() {
                ErrorKind::Xrun | ErrorKind::DeviceChanged | ErrorKind::RealtimeDenied => {
                    log::debug!("microphone: {error}");
                }
                _ => {
                    log::warn!("microphone failed: {error}");
                    failure
                        .lock()
                        .unwrap_or_else(PoisonError::into_inner)
                        .get_or_insert(device_error(error));
                }
            },
            None,
        )
        .map_err(device_error)
}

const ACCESS_DENIED_HRESULT: &str = "-2147024891";

fn device_error(error: cpal::Error) -> AudioError {
    let access_denied = error
        .message()
        .is_some_and(|message| message.contains(ACCESS_DENIED_HRESULT));
    match error.kind() {
        ErrorKind::PermissionDenied => AudioError::PermissionDenied,
        _ if access_denied => AudioError::PermissionDenied,
        ErrorKind::DeviceNotAvailable => AudioError::NoDevice,
        _ => AudioError::Device(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_wasapi_access_denied_means_the_privacy_setting_blocks_the_microphone() {
        let denied = cpal::Error::with_message(
            ErrorKind::BackendError,
            "Failed to initialize audio client: Acceso denegado. (os error -2147024891)",
        );
        assert!(matches!(device_error(denied), AudioError::PermissionDenied));
        let other = cpal::Error::with_message(ErrorKind::BackendError, "device busy (os error 5)");
        assert!(matches!(device_error(other), AudioError::Device(_)));
    }
}
