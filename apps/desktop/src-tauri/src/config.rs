use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::hotkey::Hotkey;

pub const FILE_NAME: &str = "settings.json";

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: Hotkey,
    pub first_run_done: bool,
}

pub fn load(path: &Path) -> Settings {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Settings::default(),
        Err(error) => {
            log::warn!("reading {} failed, using defaults: {error}", path.display());
            return Settings::default();
        }
    };
    serde_json::from_str(&text).unwrap_or_else(|error| {
        log::warn!("{} is invalid, using defaults: {error}", path.display());
        Settings::default()
    })
}

pub fn save(path: &Path, settings: &Settings) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let staging = path.with_extension("json.tmp");
    fs::write(&staging, serde_json::to_vec_pretty(settings)?)?;
    fs::rename(&staging, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hotkey::HotkeyKey;

    fn scratch(name: &str, contents: Option<&str>) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("tmw-config-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(FILE_NAME);
        if let Some(contents) = contents {
            fs::write(&path, contents).unwrap();
        }
        path
    }

    #[test]
    fn missing_or_invalid_files_fall_back_to_ctrl_win() {
        assert_eq!(load(&scratch("missing", None)), Settings::default());
        assert_eq!(load(&scratch("broken", Some("{"))), Settings::default());
        assert_eq!(
            load(&scratch("empty-hotkey", Some(r#"{"hotkey":[]}"#))),
            Settings::default()
        );
        for single in ["ctrl", "shift", "alt", "meta"] {
            let json = format!(r#"{{"hotkey":["{single}"]}}"#);
            assert_eq!(
                load(&scratch(&format!("single-{single}"), Some(&json))).hotkey,
                Hotkey::default()
            );
        }
    }

    #[test]
    fn saved_settings_survive_a_restart() {
        let path = scratch("saved", None);
        let settings = Settings {
            hotkey: Hotkey::new(vec![HotkeyKey::Shift, HotkeyKey::Alt]).unwrap(),
            first_run_done: true,
        };
        save(&path, &settings).unwrap();
        assert_eq!(load(&path), settings);
        assert!(!path.with_extension("json.tmp").exists());
    }
}
