use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, mpsc};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::activity::Activity;
use crate::api::{
    ApiErrorCode, ApiFailure, AuthedApi, Credentials, DictationApi, DictationMeta,
    DictationResponse, EarlierSegment, HttpApi, PasteKeystroke, SegmentApi, SegmentMeta,
    SegmentResponse,
};
use crate::audio::{AudioError, Capture, CaptureBuffer, Captured, LEVELS_PER_SECOND};
use crate::auth::Secret;
use crate::dictation::{Job, Notifier, Paste, Worker};
use crate::foreground::ForegroundApp;
use crate::hotkey::ChordEvent;
use crate::i18n::Message;
use crate::overlay::{Overlay, OverlayState};
use crate::paste::PasteResult;
use crate::rules::Keystrokes;
use crate::segments::{self, Policy, Support, TakeSegments};
use crate::session::{Input, Session, Sink};

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

struct Feed {
    buffer: Arc<Mutex<CaptureBuffer>>,
    running: Arc<AtomicBool>,
    feeder: JoinHandle<()>,
}

struct RealTime {
    next: Arc<Mutex<Option<Captured>>>,
    feed: Option<Feed>,
}

impl Capture for RealTime {
    fn start(&mut self) {
        let Some(sample) = lock(&self.next).take() else {
            return;
        };
        let buffer = Arc::new(Mutex::new(CaptureBuffer::new(
            sample.channels,
            sample.sample_rate,
        )));
        let running = Arc::new(AtomicBool::new(true));
        let chunk = sample.sample_rate as usize / LEVELS_PER_SECOND * usize::from(sample.channels);
        let (fed, playing) = (Arc::clone(&buffer), Arc::clone(&running));
        let feeder = thread::spawn(move || {
            let begin = Instant::now();
            for (index, samples) in sample.samples.chunks(chunk).enumerate() {
                let due = begin + Duration::from_millis(10 * (index as u64 + 1));
                thread::sleep(due.saturating_duration_since(Instant::now()));
                if !playing.load(Ordering::SeqCst) {
                    return;
                }
                lock(&fed).extend(samples.iter().copied());
            }
        });
        self.feed = Some(Feed {
            buffer,
            running,
            feeder,
        });
    }

    fn monitor(&mut self, _on: bool) {}

    fn stop(&mut self) -> Result<Captured, AudioError> {
        let feed = self.feed.take().ok_or(AudioError::NotStarted)?;
        feed.running.store(false, Ordering::SeqCst);
        let _ = feed.feeder.join();
        Ok(lock(&feed.buffer).take())
    }

    fn levels(&mut self, from: usize) -> Vec<f32> {
        self.feed
            .as_ref()
            .map(|feed| lock(&feed.buffer).levels_from(from))
            .unwrap_or_default()
    }

    fn between_levels(&mut self, from: usize, to: usize) -> Option<Captured> {
        self.feed
            .as_ref()
            .map(|feed| lock(&feed.buffer).between_levels(from, to))
    }
}

struct ReplaySink {
    jobs: mpsc::Sender<Job>,
    segment_jobs: mpsc::Sender<segments::Job>,
    support: Support,
    policy: Arc<Mutex<Policy>>,
    activity: Activity,
}

impl Sink for ReplaySink {
    fn may_record(&mut self) -> bool {
        true
    }

    fn segments(&mut self) -> Option<(TakeSegments, Policy)> {
        let policy = *lock(&self.policy);
        (policy.enabled && self.support.available()).then(|| {
            (
                TakeSegments::new(self.segment_jobs.clone(), self.support.clone()),
                policy,
            )
        })
    }

    fn listening(&mut self) {}

    fn hands_free(&mut self) {}

    fn chord_released(&mut self) -> bool {
        false
    }

    fn finished(&mut self, take: crate::session::Take) {
        let _ = self.jobs.send(Job {
            take,
            target: ForegroundApp::default(),
            busy: self.activity.start(),
        });
    }
}

#[derive(Clone)]
struct Token(Secret);

impl Credentials for Token {
    fn token(&self) -> Result<Secret, ApiFailure> {
        Ok(self.0.clone())
    }

    fn renew(&self, _rejected: &Secret) -> Result<Secret, ApiFailure> {
        Err(ApiFailure::SignedOut)
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum Fault {
    #[default]
    None,
    Refused,
    Slow,
}

const SLOW_SEGMENT: Duration = Duration::from_secs(30);

#[derive(Default)]
struct Trace {
    segments_started: usize,
    segments_answered: Vec<(Instant, bool)>,
    final_sent: Option<Instant>,
    final_earlier: Option<usize>,
    final_audio_bytes: usize,
    final_status: Option<u16>,
    pasted: Option<(Instant, String)>,
}

#[derive(Clone)]
struct Traced<A> {
    real: A,
    fault: Arc<Mutex<Fault>>,
    trace: Arc<Mutex<Trace>>,
}

impl<A: DictationApi> DictationApi for Traced<A> {
    fn dictate(
        &self,
        wav: Vec<u8>,
        meta: &DictationMeta,
        earlier: &[EarlierSegment],
    ) -> Result<DictationResponse, ApiFailure> {
        let bytes = wav.len();
        lock(&self.trace).final_sent = Some(Instant::now());
        let answer = self.real.dictate(wav, meta, earlier);
        let mut trace = lock(&self.trace);
        trace.final_earlier = Some(earlier.len());
        trace.final_audio_bytes = bytes;
        trace.final_status = Some(match &answer {
            Ok(_) => 200,
            Err(ApiFailure::Rejected { status, .. }) => *status,
            Err(_) => 0,
        });
        answer
    }
}

impl<A: SegmentApi> SegmentApi for Traced<A> {
    fn segment(
        &self,
        wav: Vec<u8>,
        meta: &SegmentMeta,
        previous: &str,
    ) -> Result<SegmentResponse, ApiFailure> {
        let fault = *lock(&self.fault);
        lock(&self.trace).segments_started += 1;
        let answer = match fault {
            Fault::Refused => Err(ApiFailure::Rejected {
                status: 429,
                code: Some(ApiErrorCode::QuotaExceeded),
            }),
            Fault::Slow => {
                thread::sleep(SLOW_SEGMENT);
                self.real.segment(wav, meta, previous)
            }
            Fault::None => self.real.segment(wav, meta, previous),
        };
        lock(&self.trace)
            .segments_answered
            .push((Instant::now(), answer.is_ok()));
        answer
    }
}

struct Recording(Arc<Mutex<Trace>>);

impl Paste for Recording {
    fn paste(&mut self, text: &str, _target: Option<isize>, _: PasteKeystroke) -> PasteResult {
        lock(&self.0).pasted = Some((Instant::now(), text.to_owned()));
        PasteResult::Pasted
    }
}

struct Quiet;

impl Overlay for Quiet {
    fn set(&self, _state: OverlayState) {}
}

impl Notifier for Quiet {
    fn notify(&self, _sentence: &[Message]) {}
}

impl Keystrokes for Quiet {
    fn for_app(&self, _app_id: Option<&str>) -> PasteKeystroke {
        PasteKeystroke::default()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlannedTake {
    id: String,
    wav: String,
    segmented: bool,
    #[serde(default)]
    fault: Fault,
    #[serde(default)]
    min_seconds: Option<u32>,
    #[serde(default)]
    max_seconds: Option<u32>,
    pause_after_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Measured {
    id: String,
    segmented: bool,
    policy: Option<Policy>,
    fault: Fault,
    audio_ms: u128,
    segments_sent: usize,
    segments_ok: usize,
    segments_late: usize,
    final_earlier: Option<usize>,
    final_audio_bytes: usize,
    final_status: Option<u16>,
    release_to_paste_ms: Option<u128>,
    text: Option<String>,
}

#[test]
#[ignore = "replays the takes of TMW_REPLAY_PLAN in real time against TMW_REPLAY_API_URL"]
fn replays_takes_in_real_time_against_a_deployed_server() {
    let (Ok(plan), Ok(api_url), Ok(token), Ok(out)) = (
        std::env::var("TMW_REPLAY_PLAN"),
        std::env::var("TMW_REPLAY_API_URL"),
        std::env::var("TMW_REPLAY_TOKEN"),
        std::env::var("TMW_REPLAY_OUT"),
    ) else {
        eprintln!(
            "skipped: TMW_REPLAY_PLAN, TMW_REPLAY_API_URL, TMW_REPLAY_TOKEN and TMW_REPLAY_OUT are not all set"
        );
        return;
    };
    let plan: Vec<PlannedTake> =
        serde_json::from_slice(&std::fs::read(&plan).expect("the plan is readable"))
            .expect("the plan is valid");
    let api = AuthedApi::new(
        HttpApi::new(api_url).expect("the API URL is valid"),
        Token(Secret::new(token)),
    );
    let fault = Arc::new(Mutex::new(Fault::None));
    let trace = Arc::new(Mutex::new(Trace::default()));
    let traced = Traced {
        real: api,
        fault: Arc::clone(&fault),
        trace: Arc::clone(&trace),
    };

    let (segment_jobs, segment_inbox) = mpsc::channel();
    let segment_api = traced.clone();
    thread::spawn(move || segments::serve(&segment_api, segment_inbox));

    let (jobs, job_inbox) = mpsc::channel::<Job>();
    let (done, finished) = mpsc::channel();
    let mut worker = Worker {
        api: traced,
        paste: Recording(Arc::clone(&trace)),
        overlay: Quiet,
        notifier: Quiet,
        keystrokes: Quiet,
        grace: segments::GRACE,
    };
    thread::spawn(move || {
        for job in job_inbox {
            worker.handle(job);
            let _ = done.send(());
        }
    });

    let next = Arc::new(Mutex::new(None));
    let policy = Arc::new(Mutex::new(Policy::default()));
    let sink = ReplaySink {
        jobs,
        segment_jobs,
        support: Support::default(),
        policy: Arc::clone(&policy),
        activity: Activity::default(),
    };
    let capture = RealTime {
        next: Arc::clone(&next),
        feed: None,
    };
    let (session, session_inbox) = mpsc::channel();
    thread::spawn(move || Session::new(capture, sink).run(session_inbox));

    let mut measured = Vec::new();
    for take in plan {
        let sample = crate::dev::read_wav(Path::new(&take.wav)).expect("the sample is a WAV");
        let audio = sample.duration();
        let default = Policy::default();
        let chosen = Policy {
            enabled: take.segmented,
            min_seconds: take.min_seconds.unwrap_or(default.min_seconds),
            max_seconds: take.max_seconds.unwrap_or(default.max_seconds),
            ..default
        }
        .checked();
        *lock(&policy) = chosen;
        *lock(&fault) = take.fault;
        *lock(&trace) = Trace::default();
        *lock(&next) = Some(sample);

        let pressed = Instant::now();
        let _ = session.send(Input::Chord {
            event: ChordEvent::Pressed,
            at: pressed,
        });
        thread::sleep((pressed + audio).saturating_duration_since(Instant::now()));
        let released = Instant::now();
        let _ = session.send(Input::Chord {
            event: ChordEvent::Released,
            at: released,
        });
        finished
            .recv_timeout(Duration::from_secs(90))
            .expect("the take finishes");

        let trace = std::mem::take(&mut *lock(&trace));
        let result = Measured {
            id: take.id,
            segmented: take.segmented,
            policy: take.segmented.then_some(chosen),
            fault: take.fault,
            audio_ms: audio.as_millis(),
            segments_sent: trace.segments_started,
            segments_ok: trace.segments_answered.iter().filter(|(_, ok)| *ok).count(),
            segments_late: trace.segments_started
                - trace
                    .segments_answered
                    .iter()
                    .filter(|(at, _)| trace.final_sent.is_none_or(|sent| *at <= sent))
                    .count(),
            final_earlier: trace.final_earlier,
            final_audio_bytes: trace.final_audio_bytes,
            final_status: trace.final_status,
            release_to_paste_ms: trace
                .pasted
                .as_ref()
                .map(|(at, _)| at.saturating_duration_since(released).as_millis()),
            text: trace.pasted.map(|(_, text)| text),
        };
        eprintln!(
            "replay: {} segmented={} fault={:?} {} ms of audio, {} segments, final with {:?} earlier, {:?} ms after release",
            result.id,
            result.segmented,
            result.fault,
            result.audio_ms,
            result.segments_sent,
            result.final_earlier,
            result.release_to_paste_ms,
        );
        measured.push(result);
        std::fs::write(
            &out,
            serde_json::to_vec_pretty(&measured).expect("the results serialize"),
        )
        .expect("the results are written");
        thread::sleep(Duration::from_millis(take.pause_after_ms));
    }
}
