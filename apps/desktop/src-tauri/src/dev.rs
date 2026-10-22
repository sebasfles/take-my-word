use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use crate::api::StubMode;
use crate::audio::Captured;
use crate::dictation::Job;
use crate::foreground::{ActiveWindow, SystemWindow};
use crate::session::Take;
use crate::shell::Shell;

const DUMP_DIR_FLAG: &str = "--dump-dir";
const DICTATE_WAV_FLAG: &str = "--dictate-wav";
const STUB_MODE_FLAG: &str = "--stub-mode";

fn flag_value<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    let position = args.iter().position(|arg| arg == flag)?;
    args.get(position + 1).map(String::as_str)
}

fn dump_dir() -> Option<&'static PathBuf> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        let args = std::env::args().collect::<Vec<_>>();
        flag_value(&args, DUMP_DIR_FLAG).map(PathBuf::from)
    })
    .as_ref()
}

pub fn dump_recording(wav: &[u8]) {
    let Some(dir) = dump_dir() else {
        return;
    };
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default();
    let path = dir.join(format!("recording-{millis}.wav"));
    match std::fs::create_dir_all(dir).and_then(|()| std::fs::write(&path, wav)) {
        Ok(()) => log::info!("dev: wrote {}", path.display()),
        Err(error) => log::warn!("dev: writing {} failed: {error}", path.display()),
    }
}

pub fn handle_args(app: &AppHandle, args: &[String]) -> bool {
    let stub_mode = flag_value(args, STUB_MODE_FLAG);
    if let Some(id) = stub_mode {
        match StubMode::ALL.into_iter().find(|mode| mode.id() == id) {
            Some(mode) => {
                app.state::<Shell>().stub.set_mode(mode);
                log::info!("dev: API stub mode {}", mode.label());
            }
            None => log::warn!("dev: unknown stub mode {id}"),
        }
    }
    dictate(app, args) || stub_mode.is_some()
}

fn dictate(app: &AppHandle, args: &[String]) -> bool {
    let Some(path) = flag_value(args, DICTATE_WAV_FLAG) else {
        return false;
    };
    match read_wav(Path::new(path)) {
        Ok(captured) => {
            let held = captured.duration();
            let shell = app.state::<Shell>();
            let job = Job {
                take: Take::Recorded { captured, held },
                target: SystemWindow.foreground(),
                busy: shell.activity.start(),
            };
            log::info!("dev: dictating {path}");
            let _ = shell.jobs.send(job);
        }
        Err(error) => log::warn!("dev: reading {path} failed: {error}"),
    }
    true
}

fn read_wav(path: &Path) -> Result<Captured, hound::Error> {
    let mut reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    let samples = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().collect::<Result<Vec<_>, _>>()?,
        hound::SampleFormat::Int => {
            let scale = 2f32.powi(i32::from(spec.bits_per_sample) - 1);
            reader
                .samples::<i32>()
                .map(|sample| sample.map(|value| value as f32 / scale))
                .collect::<Result<Vec<_>, _>>()?
        }
    };
    Ok(Captured {
        samples,
        channels: spec.channels,
        sample_rate: spec.sample_rate,
    })
}
