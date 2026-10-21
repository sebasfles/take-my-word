mod chord;
mod hook;
mod keys;
#[cfg(not(windows))]
mod unsupported;
#[cfg(windows)]
mod win32;

use serde::{Deserialize, Serialize};

pub use chord::ChordEvent;
pub use hook::{KeyEvent, KeyHook, OWN_INJECTION_TAG, install};
pub use keys::{CAPTURE_TIMEOUT, Keys};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Side {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Key {
    Ctrl(Side),
    Shift(Side),
    Alt(Side),
    Meta(Side),
    Other(u32),
}

impl Key {
    pub fn from_dom(code: &str) -> Option<Self> {
        let key = match code {
            "ControlLeft" => Self::Ctrl(Side::Left),
            "ControlRight" => Self::Ctrl(Side::Right),
            "ShiftLeft" => Self::Shift(Side::Left),
            "ShiftRight" => Self::Shift(Side::Right),
            "AltLeft" => Self::Alt(Side::Left),
            "AltRight" => Self::Alt(Side::Right),
            "MetaLeft" | "OSLeft" => Self::Meta(Side::Left),
            "MetaRight" | "OSRight" => Self::Meta(Side::Right),
            other => Self::Other(hook::key_code_from_dom(other)?),
        };
        Some(key)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HotkeyKey {
    Ctrl,
    Shift,
    Alt,
    Meta,
    Code(u32),
}

impl HotkeyKey {
    pub fn from_key(key: Key) -> Result<Self, HotkeyError> {
        match key {
            Key::Ctrl(_) => Ok(Self::Ctrl),
            Key::Shift(_) => Ok(Self::Shift),
            Key::Alt(Side::Left) => Ok(Self::Alt),
            Key::Alt(Side::Right) => Err(HotkeyError::RightAlt),
            Key::Meta(_) => Ok(Self::Meta),
            Key::Other(code) => Ok(Self::Code(code)),
        }
    }

    pub fn label(self) -> String {
        match self {
            Self::Ctrl => "Ctrl".into(),
            Self::Shift => "Shift".into(),
            Self::Alt => "Alt".into(),
            Self::Meta if cfg!(target_os = "macos") => "Cmd".into(),
            Self::Meta if cfg!(windows) => "Win".into(),
            Self::Meta => "Super".into(),
            Self::Code(code) => hook::key_name(code),
        }
    }

    pub fn matches(self, key: Key) -> bool {
        match (self, key) {
            (Self::Ctrl, Key::Ctrl(_))
            | (Self::Shift, Key::Shift(_))
            | (Self::Meta, Key::Meta(_)) => true,
            (Self::Alt, Key::Alt(side)) => side == Side::Left,
            (Self::Code(expected), Key::Other(code)) => expected == code,
            _ => false,
        }
    }

    fn is_modifier(self) -> bool {
        !matches!(self, Self::Code(_))
    }
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum HotkeyError {
    #[error("A shortcut needs at least {MIN_KEYS} keys held together.")]
    TooFew,
    #[error("A shortcut takes at most {MAX_KEYS} keys.")]
    TooMany,
    #[error("A shortcut needs Ctrl, Shift, Alt or Win.")]
    NoModifier,
    #[error("Right Alt is AltGr on many keyboards, so it cannot be part of the shortcut.")]
    RightAlt,
}

pub const MIN_KEYS: usize = 2;
pub const MAX_KEYS: usize = 3;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "Vec<HotkeyKey>", into = "Vec<HotkeyKey>")]
pub struct Hotkey {
    keys: Vec<HotkeyKey>,
}

impl Hotkey {
    pub fn new(mut keys: Vec<HotkeyKey>) -> Result<Self, HotkeyError> {
        keys.sort();
        keys.dedup();
        if keys.len() < MIN_KEYS {
            return Err(HotkeyError::TooFew);
        }
        if keys.len() > MAX_KEYS {
            return Err(HotkeyError::TooMany);
        }
        if !keys.iter().any(|key| key.is_modifier()) {
            return Err(HotkeyError::NoModifier);
        }
        Ok(Self { keys })
    }

    pub fn from_pressed(pressed: &[Key]) -> Result<Self, HotkeyError> {
        let keys = pressed
            .iter()
            .map(|key| HotkeyKey::from_key(*key))
            .collect::<Result<Vec<_>, _>>()?;
        Self::new(keys)
    }

    pub fn labels(&self) -> Vec<String> {
        self.keys.iter().map(|key| key.label()).collect()
    }

    pub fn keys(&self) -> &[HotkeyKey] {
        &self.keys
    }

    pub fn contains(&self, key: Key) -> bool {
        self.keys.iter().any(|hotkey_key| hotkey_key.matches(key))
    }

    pub fn uses_meta(&self) -> bool {
        self.keys.contains(&HotkeyKey::Meta)
    }
}

impl Default for Hotkey {
    fn default() -> Self {
        Self {
            keys: vec![HotkeyKey::Ctrl, HotkeyKey::Meta],
        }
    }
}

impl TryFrom<Vec<HotkeyKey>> for Hotkey {
    type Error = HotkeyError;

    fn try_from(keys: Vec<HotkeyKey>) -> Result<Self, Self::Error> {
        Self::new(keys)
    }
}

impl From<Hotkey> for Vec<HotkeyKey> {
    fn from(hotkey: Hotkey) -> Self {
        hotkey.keys
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn right_alt_is_rejected_so_altgr_can_never_become_the_hotkey() {
        assert_eq!(
            HotkeyKey::from_key(Key::Alt(Side::Right)),
            Err(HotkeyError::RightAlt)
        );
        assert_eq!(
            Hotkey::from_pressed(&[Key::Ctrl(Side::Left), Key::Alt(Side::Right)]),
            Err(HotkeyError::RightAlt)
        );
        assert_eq!(
            Hotkey::from_pressed(&[Key::Ctrl(Side::Right), Key::Alt(Side::Left)]),
            Hotkey::new(vec![HotkeyKey::Ctrl, HotkeyKey::Alt])
        );
    }

    #[test]
    fn keys_recorded_in_the_settings_page_map_to_hotkey_keys() {
        let pressed: Vec<Key> = ["ControlRight", "MetaLeft"]
            .into_iter()
            .filter_map(Key::from_dom)
            .collect();
        assert_eq!(Hotkey::from_pressed(&pressed), Ok(Hotkey::default()));
        let altgr: Vec<Key> = ["ControlLeft", "AltRight"]
            .into_iter()
            .filter_map(Key::from_dom)
            .collect();
        assert_eq!(Hotkey::from_pressed(&altgr), Err(HotkeyError::RightAlt));
        assert_eq!(Key::from_dom("Unidentified"), None);
    }

    #[test]
    fn left_alt_hotkey_does_not_match_right_alt() {
        assert!(HotkeyKey::Alt.matches(Key::Alt(Side::Left)));
        assert!(!HotkeyKey::Alt.matches(Key::Alt(Side::Right)));
    }

    #[test]
    fn ctrl_shift_and_meta_match_either_side() {
        let hotkey = Hotkey::new(vec![HotkeyKey::Ctrl, HotkeyKey::Shift, HotkeyKey::Meta]).unwrap();
        for side in [Side::Left, Side::Right] {
            assert!(hotkey.contains(Key::Ctrl(side)));
            assert!(hotkey.contains(Key::Shift(side)));
            assert!(hotkey.contains(Key::Meta(side)));
        }
    }

    #[test]
    fn a_single_key_is_never_a_hotkey() {
        for key in [
            HotkeyKey::Ctrl,
            HotkeyKey::Shift,
            HotkeyKey::Alt,
            HotkeyKey::Meta,
            HotkeyKey::Code(0x7C),
        ] {
            assert_eq!(Hotkey::new(vec![key]), Err(HotkeyError::TooFew));
        }
        assert_eq!(
            Hotkey::new(vec![HotkeyKey::Ctrl, HotkeyKey::Ctrl]),
            Err(HotkeyError::TooFew)
        );
    }

    #[test]
    fn validation_rejects_empty_oversized_and_modifierless_hotkeys() {
        assert_eq!(Hotkey::new(vec![]), Err(HotkeyError::TooFew));
        assert_eq!(
            Hotkey::new(vec![
                HotkeyKey::Ctrl,
                HotkeyKey::Shift,
                HotkeyKey::Alt,
                HotkeyKey::Meta
            ]),
            Err(HotkeyError::TooMany)
        );
        assert_eq!(
            Hotkey::new(vec![HotkeyKey::Code(0x41), HotkeyKey::Code(0x42)]),
            Err(HotkeyError::NoModifier)
        );
        assert_eq!(
            Hotkey::new(vec![HotkeyKey::Meta, HotkeyKey::Ctrl, HotkeyKey::Ctrl]),
            Ok(Hotkey::default())
        );
    }

    #[test]
    fn hotkey_config_round_trips_and_rejects_invalid_lists() {
        let json = serde_json::to_string(&Hotkey::default()).unwrap();
        assert_eq!(json, r#"["ctrl","meta"]"#);
        assert_eq!(
            serde_json::from_str::<Hotkey>(&json).unwrap(),
            Hotkey::default()
        );
        assert!(serde_json::from_str::<Hotkey>("[]").is_err());
        let with_code: Hotkey = serde_json::from_str(r#"["shift",{"code":124}]"#).unwrap();
        assert!(with_code.contains(Key::Other(124)));
    }
}
