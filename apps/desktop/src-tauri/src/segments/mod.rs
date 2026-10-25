mod detector;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError, mpsc};
use std::time::Duration;

use crate::api::{ApiFailure, EarlierSegment, SegmentApi, SegmentMeta};
use crate::audio::{self, Captured};
use crate::locale::Language;

#[cfg(test)]
pub use detector::TEN_TWENTY;
pub use detector::{Detector, Policy};

pub const GRACE: Duration = Duration::from_millis(1500);

#[derive(Clone, Debug)]
pub struct Support(Arc<AtomicBool>);

impl Default for Support {
    fn default() -> Self {
        Self(Arc::new(AtomicBool::new(true)))
    }
}

impl Support {
    pub fn available(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }

    pub fn reset(&self) {
        self.0.store(true, Ordering::Relaxed);
    }

    fn missing(&self) {
        if self.0.swap(false, Ordering::Relaxed) {
            log::info!("segments: the server has no segment route, sending whole takes");
        }
    }
}

pub struct Job {
    take: TakeSegments,
    captured: Captured,
    end: usize,
}

#[cfg(test)]
impl Job {
    pub fn take(&self) -> &TakeSegments {
        &self.take
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Finished {
    pub earlier: Vec<EarlierSegment>,
    pub covered: usize,
    pub language: Option<Language>,
    pub sent: usize,
    pub late: bool,
}

#[derive(Default)]
struct State {
    done: Vec<EarlierSegment>,
    covered: usize,
    language: Option<Language>,
    sent: usize,
    in_flight: bool,
    stopped: bool,
    closed: bool,
}

#[derive(Default)]
struct Shared {
    state: Mutex<State>,
    changed: Condvar,
}

#[derive(Clone)]
pub struct TakeSegments {
    shared: Arc<Shared>,
    jobs: mpsc::Sender<Job>,
    support: Support,
}

impl std::fmt::Debug for TakeSegments {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let state = self.state();
        formatter
            .debug_struct("TakeSegments")
            .field("sent", &state.sent)
            .field("covered", &state.covered)
            .finish_non_exhaustive()
    }
}

impl TakeSegments {
    pub fn new(jobs: mpsc::Sender<Job>, support: Support) -> Self {
        Self {
            shared: Arc::default(),
            jobs,
            support,
        }
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.shared
            .state
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    #[cfg(test)]
    pub fn answered(
        jobs: mpsc::Sender<Job>,
        support: Support,
        done: Vec<EarlierSegment>,
        covered: usize,
        language: Option<Language>,
        in_flight: bool,
    ) -> Self {
        let take = Self::new(jobs, support);
        *take.state() = State {
            sent: done.len() + usize::from(in_flight),
            done,
            covered,
            language,
            in_flight,
            ..State::default()
        };
        take
    }

    pub fn may_cut(&self) -> bool {
        let state = self.state();
        !state.in_flight && !state.stopped && !state.closed && self.support.available()
    }

    pub fn send(&self, captured: Captured, end: usize) {
        let mut state = self.state();
        state.in_flight = true;
        state.sent += 1;
        let job = Job {
            take: self.clone(),
            captured,
            end,
        };
        if self.jobs.send(job).is_err() {
            state.in_flight = false;
            state.stopped = true;
        }
    }

    pub fn skip(&self, end: usize) {
        let mut state = self.state();
        if !state.in_flight {
            state.covered = end;
        }
    }

    pub fn stop(&self) {
        self.state().stopped = true;
    }

    pub fn cancel(&self) {
        self.state().closed = true;
        self.shared.changed.notify_all();
    }

    pub fn finish(&self, grace: Duration) -> Finished {
        let state = self.state();
        let (mut state, _) = self
            .shared
            .changed
            .wait_timeout_while(state, grace, |state| state.in_flight)
            .unwrap_or_else(PoisonError::into_inner);
        state.closed = true;
        Finished {
            earlier: std::mem::take(&mut state.done),
            covered: state.covered,
            language: state.language,
            sent: state.sent,
            late: state.in_flight,
        }
    }

    fn transcribe(&self, api: &impl SegmentApi, captured: &Captured, end: usize) {
        let request = {
            let state = self.state();
            (!state.closed).then(|| {
                let previous = state
                    .done
                    .iter()
                    .map(|segment| segment.text.trim())
                    .filter(|text| !text.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");
                let meta = SegmentMeta {
                    language: state.language,
                    ..SegmentMeta::default()
                };
                (meta, previous)
            })
        };
        let outcome = request.map(|(meta, previous)| {
            audio::encode_wav(captured)
                .map_err(|error| ApiFailure::Network(error.to_string()))
                .and_then(|wav| api.segment(wav, &meta, &previous))
        });
        let mut state = self.state();
        state.in_flight = false;
        match outcome {
            None => {}
            Some(_) if state.closed => log::info!("segments: a segment answered after release"),
            Some(Ok(answer)) => {
                if let Some(receipt) = answer.receipt {
                    state.done.push(EarlierSegment {
                        text: answer.raw,
                        receipt,
                    });
                }
                state.covered = end;
                state.language = state.language.or(answer.language);
            }
            Some(Err(failure)) => {
                state.stopped = true;
                match failure {
                    ApiFailure::Rejected { status: 404, .. } => self.support.missing(),
                    failure => {
                        log::warn!("segments: a segment failed, the take goes whole: {failure}")
                    }
                }
            }
        }
        drop(state);
        self.shared.changed.notify_all();
    }
}

pub fn serve(api: &impl SegmentApi, inbox: mpsc::Receiver<Job>) {
    for job in inbox {
        job.take.transcribe(api, &job.captured, job.end);
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;
    use std::thread;
    use std::time::Instant;

    use super::*;
    use crate::api::{ApiErrorCode, SegmentResponse};

    type Answer = Box<dyn Fn(&SegmentMeta, &str) -> Result<SegmentResponse, ApiFailure> + Send>;

    struct FakeApi {
        answers: Mutex<Vec<Answer>>,
        delay: Duration,
        seen: Mutex<Vec<(SegmentMeta, String)>>,
    }

    impl SegmentApi for Arc<FakeApi> {
        fn segment(
            &self,
            wav: Vec<u8>,
            meta: &SegmentMeta,
            previous: &str,
        ) -> Result<SegmentResponse, ApiFailure> {
            assert!(wav.starts_with(b"RIFF"));
            thread::sleep(self.delay);
            self.seen
                .lock()
                .unwrap()
                .push((meta.clone(), previous.to_owned()));
            let answer = self.answers.lock().unwrap().remove(0);
            answer(meta, previous)
        }
    }

    fn text(raw: &'static str) -> Answer {
        Box::new(move |_, _| {
            Ok(SegmentResponse {
                raw: raw.into(),
                language: Some(Language::Es),
                receipt: Some(format!("receipt-{raw}")),
                ..SegmentResponse::default()
            })
        })
    }

    fn failing(failure: fn() -> ApiFailure) -> Answer {
        Box::new(move |_, _| Err(failure()))
    }

    struct Harness {
        api: Arc<FakeApi>,
        jobs: mpsc::Sender<Job>,
        support: Support,
    }

    fn harness(answers: Vec<Answer>, delay: Duration) -> Harness {
        let api = Arc::new(FakeApi {
            answers: Mutex::new(answers),
            delay,
            seen: Mutex::default(),
        });
        let (jobs, inbox) = mpsc::channel();
        let served = Arc::clone(&api);
        thread::spawn(move || serve(&served, inbox));
        Harness {
            api,
            jobs,
            support: Support::default(),
        }
    }

    fn second() -> Captured {
        Captured {
            samples: vec![0.1; 16_000],
            channels: 1,
            sample_rate: 16_000,
        }
    }

    fn settle(take: &TakeSegments) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !take.may_cut() && Instant::now() < deadline && !take.state().stopped {
            thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn segments_go_one_at_a_time_and_carry_the_previous_text_and_first_language() {
        let harness = harness(vec![text("uno"), text("dos")], Duration::ZERO);
        let take = TakeSegments::new(harness.jobs.clone(), harness.support.clone());
        assert!(take.may_cut());
        take.send(second(), 1_000);
        assert!(!take.may_cut());
        settle(&take);
        take.send(second(), 2_100);
        settle(&take);
        let finished = take.finish(GRACE);
        assert_eq!(
            finished.earlier,
            vec![
                EarlierSegment {
                    text: "uno".into(),
                    receipt: "receipt-uno".into()
                },
                EarlierSegment {
                    text: "dos".into(),
                    receipt: "receipt-dos".into()
                }
            ]
        );
        assert_eq!(finished.covered, 2_100);
        assert_eq!(finished.language, Some(Language::Es));
        let seen = harness.api.seen.lock().unwrap();
        assert_eq!(seen[0], (SegmentMeta::default(), String::new()));
        assert_eq!(seen[1].0.language, Some(Language::Es));
        assert_eq!(seen[1].1, "uno");
        assert!(!take.may_cut());
    }

    #[test]
    fn a_failed_segment_stops_the_take_and_leaves_its_audio_to_the_final() {
        let quota = || ApiFailure::Rejected {
            status: 429,
            code: Some(ApiErrorCode::QuotaExceeded),
        };
        let harness = harness(vec![text("uno"), failing(quota)], Duration::ZERO);
        let take = TakeSegments::new(harness.jobs.clone(), harness.support.clone());
        take.send(second(), 1_000);
        settle(&take);
        take.send(second(), 2_000);
        settle(&take);
        assert!(!take.may_cut());
        let finished = take.finish(GRACE);
        assert_eq!(finished.earlier.len(), 1);
        assert_eq!(finished.covered, 1_000);
        assert!(!finished.late);
        assert!(harness.support.available());
    }

    #[test]
    fn a_missing_route_turns_segments_off_for_the_server_until_reset() {
        let missing = || ApiFailure::Rejected {
            status: 404,
            code: None,
        };
        let harness = harness(vec![failing(missing)], Duration::ZERO);
        let take = TakeSegments::new(harness.jobs.clone(), harness.support.clone());
        take.send(second(), 1_000);
        settle(&take);
        assert_eq!(
            take.finish(GRACE),
            Finished {
                sent: 1,
                ..Finished::default()
            }
        );
        let next = TakeSegments::new(harness.jobs.clone(), harness.support.clone());
        assert!(!next.may_cut());
        harness.support.reset();
        assert!(next.may_cut());
    }

    #[test]
    fn release_waits_a_bounded_grace_for_a_segment_in_flight() {
        let harness = harness(vec![text("uno")], Duration::from_millis(300));
        let take = TakeSegments::new(harness.jobs.clone(), harness.support.clone());
        take.send(second(), 1_000);
        let started = Instant::now();
        let finished = take.finish(GRACE);
        assert!(started.elapsed() < GRACE);
        assert_eq!(finished.earlier.len(), 1);
        assert!(!finished.late);
    }

    #[test]
    fn a_segment_still_in_flight_after_the_grace_is_late_and_its_answer_is_dropped() {
        let harness = harness(vec![text("uno")], Duration::from_millis(400));
        let take = TakeSegments::new(harness.jobs.clone(), harness.support.clone());
        take.send(second(), 1_000);
        let started = Instant::now();
        let finished = take.finish(Duration::from_millis(50));
        assert!(started.elapsed() < Duration::from_millis(300));
        assert_eq!(finished.covered, 0);
        assert!(finished.earlier.is_empty());
        assert!(finished.late);
        thread::sleep(Duration::from_millis(600));
        assert!(take.state().done.is_empty());
        assert!(!take.may_cut());
    }

    #[test]
    fn a_silent_segment_without_receipt_is_covered_without_text() {
        let silent: Answer = Box::new(|_, _| Ok(SegmentResponse::default()));
        let harness = harness(vec![silent, text("dos")], Duration::ZERO);
        let take = TakeSegments::new(harness.jobs.clone(), harness.support.clone());
        take.send(second(), 1_000);
        settle(&take);
        take.send(second(), 2_000);
        settle(&take);
        let finished = take.finish(GRACE);
        assert_eq!(finished.earlier.len(), 1);
        assert_eq!(finished.covered, 2_000);
    }

    #[test]
    fn a_cancelled_take_never_sends_what_was_queued() {
        let harness = harness(vec![], Duration::ZERO);
        let (jobs, inbox) = mpsc::channel();
        let take = TakeSegments::new(jobs, harness.support.clone());
        take.send(second(), 1_000);
        take.cancel();
        drop(take);
        serve(&harness.api, inbox);
        assert!(harness.api.seen.lock().unwrap().is_empty());
    }
}
