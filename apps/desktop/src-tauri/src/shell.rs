use std::sync::{Arc, mpsc};
use std::thread;

use crate::audio::Microphone;
use crate::config::Settings;
use crate::hotkey::{self, Key, KeyHook};
use crate::session::{Effects, Input, Outcome, Session};

pub fn start(settings: Settings) {
    let (inbox, session_inbox) = mpsc::channel();
    let hook = match hotkey::install(Box::new(move |event| {
        let _ = inbox.send(Input::Key(event));
    })) {
        Ok(hook) => Some(hook),
        Err(error) => {
            log::error!("{error}");
            None
        }
    };
    let microphone = match Microphone::spawn() {
        Ok(microphone) => microphone,
        Err(error) => {
            log::error!("{error}");
            return;
        }
    };
    let effects = ShellEffects { hook };
    let spawned = thread::Builder::new()
        .name("session".into())
        .spawn(move || Session::new(settings.hotkey, microphone, effects).run(session_inbox));
    if let Err(error) = spawned {
        log::error!("starting the dictation session failed: {error}");
    }
}

struct ShellEffects {
    hook: Option<Arc<dyn KeyHook>>,
}

impl Effects for ShellEffects {
    fn is_held(&self, key: Key) -> bool {
        self.hook.as_ref().is_none_or(|hook| hook.is_held(key))
    }

    fn guard_start_menu(&mut self) {
        if let Some(hook) = &self.hook {
            hook.guard_start_menu();
        }
    }

    fn listening(&mut self) {
        log::info!("listening");
    }

    fn finished(&mut self, outcome: Outcome) {
        match outcome {
            Outcome::Recorded { wav, held } => {
                log::info!("recorded {} ms, {} bytes", held.as_millis(), wav.len());
                #[cfg(debug_assertions)]
                crate::dev::dump_recording(&wav);
            }
            Outcome::TooShort => log::info!("discarded a press under half a second"),
            Outcome::Cancelled => log::info!("dictation cancelled by another key"),
            Outcome::Failed(error) => log::warn!("dictation failed: {error}"),
        }
    }
}
