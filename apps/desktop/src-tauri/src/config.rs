use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::hotkey::Hotkey;
use crate::locale::Language;
use crate::segments::Policy;
use crate::server::SelfHosted;
use crate::theme::Theme;

pub const FILE_NAME: &str = "settings.json";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: Hotkey,
    pub first_run_done: bool,
    pub onboarded_users: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ui_language: Option<Language>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<Theme>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub main_window: Option<Placement>,
    pub hands_free_note_seen: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server: Option<SelfHosted>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segmentation: Option<Policy>,
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
    use crate::server::Server;

    struct Scratch(std::path::PathBuf);

    impl std::ops::Deref for Scratch {
        type Target = Path;

        fn deref(&self) -> &Path {
            &self.0
        }
    }

    impl AsRef<Path> for Scratch {
        fn as_ref(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            if let Some(dir) = self.0.parent() {
                let _ = fs::remove_dir_all(dir);
            }
        }
    }

    fn scratch(name: &str, contents: Option<&str>) -> Scratch {
        let dir = std::env::temp_dir().join(format!("tmw-config-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(FILE_NAME);
        if let Some(contents) = contents {
            fs::write(&path, contents).unwrap();
        }
        Scratch(path)
    }

    #[test]
    fn the_app_language_is_saved_only_when_chosen() {
        let path = scratch("ui-language", None);
        let chosen = Settings {
            ui_language: Some(Language::Es),
            ..Settings::default()
        };
        save(&path, &chosen).unwrap();
        assert!(
            fs::read_to_string(&path)
                .unwrap()
                .contains(r#""uiLanguage": "es""#)
        );
        assert_eq!(load(&path), chosen);
        save(&path, &Settings::default()).unwrap();
        assert!(!fs::read_to_string(&path).unwrap().contains("uiLanguage"));
        assert_eq!(load(&path).ui_language, None);
    }

    #[test]
    fn the_theme_is_saved_only_when_chosen() {
        let path = scratch("theme", None);
        let chosen = Settings {
            theme: Some(Theme::Dark),
            ..Settings::default()
        };
        save(&path, &chosen).unwrap();
        assert!(
            fs::read_to_string(&path)
                .unwrap()
                .contains(r#""theme": "dark""#)
        );
        assert_eq!(load(&path), chosen);
        save(&path, &Settings::default()).unwrap();
        assert!(!fs::read_to_string(&path).unwrap().contains("theme"));
        assert_eq!(load(&path).theme, None);
    }

    #[test]
    fn missing_or_invalid_files_fall_back_to_the_builds_default_hotkey() {
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
    fn a_saved_hotkey_is_kept_even_when_it_differs_from_the_builds_default() {
        let path = scratch(
            "saved-ctrl-win",
            Some(r#"{"hotkey":["ctrl","meta"],"firstRunDone":true}"#),
        );
        assert_eq!(load(&path).hotkey, Hotkey::ctrl_win());
        let missing = scratch("no-hotkey", Some(r#"{"firstRunDone":true}"#));
        assert_eq!(load(&missing).hotkey, Hotkey::default());
    }

    #[test]
    fn a_0_2_0_settings_file_reads_as_an_upgraded_user_who_has_not_seen_hands_free() {
        let path = scratch(
            "upgraded",
            Some(r#"{"hotkey":["ctrl","meta"],"firstRunDone":true,"onboardedUsers":["a"]}"#),
        );
        let settings = load(&path);
        assert!(settings.first_run_done);
        assert!(!settings.hands_free_note_seen);
        assert_eq!(settings.main_window, None);
        assert_eq!(settings.server, None);
    }

    #[test]
    fn saved_settings_survive_a_restart() {
        let path = scratch("saved", None);
        let settings = Settings {
            hotkey: Hotkey::new(vec![HotkeyKey::Shift, HotkeyKey::Alt]).unwrap(),
            first_run_done: true,
            onboarded_users: vec!["2448e4f8-2081-70f1-5c1b-1f2e3d4c5b6a".into()],
            ui_language: Some(Language::En),
            theme: Some(Theme::Light),
            main_window: Some(Placement {
                x: -1200,
                y: 40,
                width: 1100,
                height: 760,
                maximized: true,
            }),
            hands_free_note_seen: true,
            server: Some(SelfHosted {
                domain: "dictation.example.com".into(),
                server: Server {
                    version: 1,
                    api_url: "https://api.dictation.example.com".into(),
                    region: "eu-west-2".into(),
                    user_pool_id: "eu-west-2_AbC123xyZ".into(),
                    client_id: "1example23client45id6789ab".into(),
                },
            }),
            segmentation: Some(crate::segments::Policy {
                enabled: false,
                ..crate::segments::Policy::default()
            }),
        };
        save(&path, &settings).unwrap();
        assert_eq!(load(&path), settings);
        assert!(!path.with_extension("json.tmp").exists());
    }
}
