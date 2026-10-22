use std::sync::{PoisonError, RwLock};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
}

impl Theme {
    pub fn code(self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }

    pub fn native(choice: Option<Self>) -> Option<tauri::Theme> {
        choice.map(|theme| match theme {
            Self::Light => tauri::Theme::Light,
            Self::Dark => tauri::Theme::Dark,
        })
    }
}

static CHOICE: RwLock<Option<Theme>> = RwLock::new(None);

pub fn choice() -> Option<Theme> {
    *CHOICE.read().unwrap_or_else(PoisonError::into_inner)
}

pub fn choose(choice: Option<Theme>) {
    *CHOICE.write().unwrap_or_else(PoisonError::into_inner) = choice;
}

pub fn query() -> String {
    choice().map_or_else(String::new, |theme| format!("&theme={}", theme.code()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_windows_follow_the_chosen_theme_or_windows() {
        choose(Some(Theme::Dark));
        assert_eq!(query(), "&theme=dark");
        assert_eq!(Theme::native(choice()), Some(tauri::Theme::Dark));
        choose(Some(Theme::Light));
        assert_eq!(query(), "&theme=light");
        choose(None);
        assert_eq!(query(), "");
        assert_eq!(Theme::native(choice()), None);
    }
}
