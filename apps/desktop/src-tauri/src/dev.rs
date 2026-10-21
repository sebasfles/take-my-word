use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

const DUMP_DIR_FLAG: &str = "--dump-dir";

fn dump_dir() -> Option<&'static PathBuf> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        let mut args = std::env::args().skip_while(|arg| arg != DUMP_DIR_FLAG);
        args.next()?;
        args.next().map(PathBuf::from)
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
