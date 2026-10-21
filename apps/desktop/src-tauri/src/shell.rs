use std::sync::mpsc;
use std::thread;
use std::time::Instant;

use crate::audio::{self, Microphone};
use crate::config::Settings;
use crate::hotkey::{self, ChordTracker};
use crate::session::{Input, Session, Sink, Take};

pub fn start(settings: Settings) {
    let microphone = match Microphone::spawn() {
        Ok(microphone) => microphone,
        Err(error) => {
            log::error!("{error}");
            return;
        }
    };
    let (inbox, session_inbox) = mpsc::channel();
    let mut chords = ChordTracker::new(settings.hotkey);
    let installed = hotkey::install(Box::new(move |event, keyboard| {
        if let Some(event) = chords.on_key(event, keyboard) {
            let _ = inbox.send(Input::Chord {
                event,
                at: Instant::now(),
            });
        }
    }));
    if let Err(error) = installed {
        log::error!("{error}");
        return;
    }
    let (finished, takes) = mpsc::channel();
    let spawned = thread::Builder::new()
        .name("dictation".into())
        .spawn(move || takes.into_iter().for_each(finish))
        .and_then(|_| {
            thread::Builder::new()
                .name("session".into())
                .spawn(move || Session::new(microphone, ShellSink { finished }).run(session_inbox))
        });
    if let Err(error) = spawned {
        log::error!("starting the dictation threads failed: {error}");
    }
}

struct ShellSink {
    finished: mpsc::Sender<Take>,
}

impl Sink for ShellSink {
    fn listening(&mut self) {
        log::info!("listening");
    }

    fn finished(&mut self, take: Take) {
        let _ = self.finished.send(take);
    }
}

fn finish(take: Take) {
    match take {
        Take::Recorded { captured, held } => match audio::encode_wav(&captured) {
            Ok(wav) => {
                log::info!("recorded {} ms, {} bytes", held.as_millis(), wav.len());
                #[cfg(debug_assertions)]
                crate::dev::dump_recording(&wav);
            }
            Err(error) => log::warn!("dictation failed: {error}"),
        },
        Take::TooShort => log::info!("discarded a press under half a second"),
        Take::Cancelled => log::info!("dictation cancelled by another key"),
        Take::Failed(error) => log::warn!("dictation failed: {error}"),
    }
}
