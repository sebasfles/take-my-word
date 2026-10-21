use std::sync::{Arc, Mutex, PoisonError, mpsc};
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{ErrorKind, FromSample, SampleFormat, SizedSample, Stream, StreamConfig};

use super::{AudioError, Capture, CaptureBuffer, Captured};

enum Command {
    Start,
    Stop(mpsc::Sender<Result<Captured, AudioError>>),
}

pub struct Microphone {
    commands: mpsc::Sender<Command>,
}

impl Microphone {
    pub fn spawn() -> Result<Self, AudioError> {
        let (commands, inbox) = mpsc::channel();
        thread::Builder::new()
            .name("microphone".into())
            .spawn(move || serve(inbox))
            .map_err(|error| AudioError::Device(error.to_string()))?;
        Ok(Self { commands })
    }
}

impl Capture for Microphone {
    fn start(&mut self) {
        let _ = self.commands.send(Command::Start);
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
}

impl Armed {
    fn new() -> Result<Self, AudioError> {
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
        let stream = match supported.sample_format() {
            SampleFormat::F32 => build::<f32>(&device, config, &buffer, &failure),
            SampleFormat::F64 => build::<f64>(&device, config, &buffer, &failure),
            SampleFormat::I16 => build::<i16>(&device, config, &buffer, &failure),
            SampleFormat::I32 => build::<i32>(&device, config, &buffer, &failure),
            SampleFormat::I8 => build::<i8>(&device, config, &buffer, &failure),
            SampleFormat::U16 => build::<u16>(&device, config, &buffer, &failure),
            SampleFormat::U8 => build::<u8>(&device, config, &buffer, &failure),
            other => Err(AudioError::Device(format!(
                "unsupported sample format {other}"
            ))),
        }?;
        Ok(Self {
            stream,
            buffer,
            failure,
        })
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

fn arm() -> Option<Armed> {
    Armed::new()
        .inspect_err(|error| log::warn!("preparing the microphone failed: {error}"))
        .ok()
}

fn serve(inbox: mpsc::Receiver<Command>) {
    let mut armed = arm();
    let mut recording: Option<Result<Armed, AudioError>> = None;
    for command in inbox {
        match command {
            Command::Start => {
                if recording.is_none() {
                    let started = match armed.take().filter(Armed::healthy) {
                        Some(ready) => ready.play().or_else(|_| Armed::new()?.play()),
                        None => Armed::new().and_then(Armed::play),
                    };
                    recording = Some(started);
                }
            }
            Command::Stop(reply) => {
                let result = match recording.take() {
                    Some(Ok(recording)) => recording.finish(),
                    Some(Err(error)) => Err(error),
                    None => Err(AudioError::NotStarted),
                };
                let _ = reply.send(result);
                armed = arm();
            }
        }
    }
}

fn build<T>(
    device: &cpal::Device,
    config: StreamConfig,
    buffer: &SharedBuffer,
    failure: &SharedFailure,
) -> Result<Stream, AudioError>
where
    T: SizedSample + Send + 'static,
    f32: FromSample<T>,
{
    let buffer = Arc::clone(buffer);
    let failure = Arc::clone(failure);
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                buffer
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .extend(data.iter().map(|sample| sample.to_sample::<f32>()));
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

fn device_error(error: cpal::Error) -> AudioError {
    match error.kind() {
        ErrorKind::PermissionDenied => AudioError::PermissionDenied,
        ErrorKind::DeviceNotAvailable => AudioError::NoDevice,
        _ => AudioError::Device(error.to_string()),
    }
}
