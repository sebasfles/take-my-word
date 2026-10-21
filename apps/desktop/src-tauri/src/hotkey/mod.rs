mod chord;
mod hook;
#[cfg(not(windows))]
mod unsupported;
#[cfg(windows)]
mod win32;

use serde::{Deserialize, Serialize};

pub use chord::{ChordEvent, ChordTracker};
pub use hook::{KeyEvent, KeyHook, install};

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
    #[error("the hotkey needs at least {MIN_KEYS} keys")]
    TooFew,
    #[error("the hotkey takes at most {MAX_KEYS} keys")]
    TooMany,
    #[error("the hotkey needs a modifier (Ctrl, Shift, Alt or Win)")]
    NoModifier,
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
