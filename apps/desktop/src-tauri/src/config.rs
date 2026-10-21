use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::hotkey::Hotkey;

pub const FILE_NAME: &str = "settings.json";

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: Hotkey,
}

pub fn load(path: &Path) -> Settings {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Settings::default(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hotkey::HotkeyKey;

    fn scratch(name: &str, contents: Option<&str>) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("tmw-config-{name}-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(FILE_NAME);
        let _ = fs::remove_file(&path);
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
    fn a_stored_hotkey_is_loaded() {
        let path = scratch("stored", Some(r#"{"hotkey":["alt","shift"]}"#));
        assert_eq!(
            load(&path).hotkey,
            Hotkey::new(vec![HotkeyKey::Shift, HotkeyKey::Alt]).unwrap()
        );
    }
}
