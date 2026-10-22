use std::collections::HashMap;
use std::sync::{LazyLock, PoisonError, RwLock};

use serde::{Serialize, Serializer};

use crate::locale::{self, Language};

macro_rules! messages {
    ($($variant:ident => $id:literal,)*) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum Message {
            $($variant,)*
        }

        impl Message {
            #[cfg(test)]
            const ALL: &[Message] = &[$(Message::$variant,)*];

            pub fn id(self) -> &'static str {
                match self {
                    $(Message::$variant => $id,)*
                }
            }
        }
    };
}

messages! {
    Generic => "error.generic",
    WrongCredentials => "account.wrongCredentials",
    InvalidPassword => "account.invalidPassword",
    SignInExpired => "account.expired",
    SessionEnded => "account.sessionEnded",
    Unreachable => "account.unreachable",
    FirstRunTitle => "firstRun.title",
    HotkeyNotInSettings => "hotkey.notInSettings",
    HotkeyNothingToSave => "hotkey.nothingToSave",
    HotkeyCaptureEnded => "hotkey.captureEnded",
    HotkeyKeyNotAllowed => "hotkey.keyNotAllowed",
    HotkeyTooFew => "hotkey.tooFew",
    HotkeyTooMany => "hotkey.tooMany",
    HotkeyNoModifier => "hotkey.noModifier",
    HotkeyRightAlt => "hotkey.rightAlt",
    PasteFailed => "overlay.pasteFailed",
    MicrophoneBlocked => "overlay.microphoneBlocked",
    MicrophoneSilent => "overlay.microphoneSilent",
    MicrophoneMissing => "overlay.microphoneMissing",
    MicrophoneFailed => "overlay.microphoneFailed",
    SignInToDictate => "overlay.signIn",
    DictationUnreachable => "overlay.unreachable",
    QuotaReached => "overlay.quota",
    TooLong => "overlay.tooLong",
    UnsupportedFormat => "overlay.format",
    ClipboardLost => "notice.clipboardLost",
    NotPasted => "notice.notPasted",
    NotPastedFocusChanged => "notice.focusChanged",
    NotPastedElevated => "notice.elevated",
    PreviousNotPasted => "notice.previousNotPasted",
    CopyFailed => "history.copyFailed",
    TraySettings => "tray.settings",
    TrayAddWord => "tray.addWord",
    TraySignIn => "tray.signIn",
    TraySignOut => "tray.signOut",
    TrayQuit => "tray.quit",
    TrayReady => "tray.ready",
    TrayListening => "tray.listening",
    TraySignedOut => "tray.signedOut",
    TrayMicrophoneBlocked => "tray.microphoneBlocked",
    TrayMicrophoneMissing => "tray.microphoneMissing",
}

impl Serialize for Message {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.id())
    }
}

type Dictionary = HashMap<String, String>;

fn parse(json: &str) -> Dictionary {
    serde_json::from_str(json).expect("the message dictionaries are valid JSON")
}

static ES: LazyLock<Dictionary> = LazyLock::new(|| parse(include_str!("../../src/i18n/es.json")));
static EN: LazyLock<Dictionary> = LazyLock::new(|| parse(include_str!("../../src/i18n/en.json")));
static LANGUAGE: LazyLock<RwLock<Language>> =
    LazyLock::new(|| RwLock::new(locale::system_language()));

pub fn language() -> Language {
    *LANGUAGE.read().unwrap_or_else(PoisonError::into_inner)
}

pub fn set_language(language: Language) {
    *LANGUAGE.write().unwrap_or_else(PoisonError::into_inner) = language;
}

pub fn choose(choice: Option<Language>) -> Language {
    let language = choice.unwrap_or_else(locale::system_language);
    set_language(language);
    language
}

pub fn text(message: Message) -> &'static str {
    text_in(language(), message)
}

fn text_in(language: Language, message: Message) -> &'static str {
    let dictionary = match language {
        Language::Es => &*ES,
        Language::En => &*EN,
    };
    dictionary
        .get(message.id())
        .map_or(message.id(), String::as_str)
}

pub fn sentence(messages: &[Message]) -> String {
    messages
        .iter()
        .map(|message| text(*message))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_message_rust_sends_exists_in_both_languages() {
        for message in Message::ALL {
            assert!(ES.contains_key(message.id()), "es lacks {}", message.id());
            assert!(EN.contains_key(message.id()), "en lacks {}", message.id());
        }
    }

    #[test]
    fn a_chosen_language_replaces_windows_until_it_is_cleared() {
        assert_eq!(choose(Some(Language::Es)), Language::Es);
        assert_eq!(text(Message::TrayQuit), ES["tray.quit"]);
        assert_eq!(choose(Some(Language::En)), Language::En);
        assert_eq!(text(Message::TrayQuit), EN["tray.quit"]);
        assert_eq!(choose(None), locale::system_language());
    }

    #[test]
    fn messages_cross_ipc_as_their_id() {
        assert_eq!(
            serde_json::to_string(&Message::QuotaReached).unwrap(),
            r#""overlay.quota""#
        );
    }
}
