use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::audio::LEVELS_PER_SECOND;

const LOWEST_LEVEL: f32 = 1e-5;
const FLOOR_RISE_DB_PER_SECOND: f32 = 1.0;
const QUIET_ABOVE_FLOOR_DB: f32 = 10.0;
const LOUDEST_QUIET_DBFS: f32 = -30.0;
const ALWAYS_QUIET_DBFS: f32 = -60.0;
const FORCED_CUT_WINDOW: Duration = Duration::from_secs(1);
const LEAST_SPEECH: Duration = Duration::from_millis(300);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cut {
    pub at: usize,
    pub spoken: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Policy {
    pub enabled: bool,
    pub min_seconds: u32,
    pub max_seconds: u32,
    pub pause_ms: u32,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            enabled: false,
            min_seconds: 20,
            max_seconds: 30,
            pause_ms: 600,
        }
    }
}

#[cfg(test)]
pub const TEN_TWENTY: Policy = Policy {
    enabled: true,
    min_seconds: 10,
    max_seconds: 20,
    pause_ms: 600,
};

impl Policy {
    pub fn checked(self) -> Self {
        let default = Self::default();
        if self.min_seconds == 0 || self.max_seconds <= self.min_seconds || self.pause_ms == 0 {
            log::warn!("the segmentation policy is not valid, using the default one");
            return Self {
                enabled: self.enabled,
                ..default
            };
        }
        self
    }
}

fn levels_in(duration: Duration) -> usize {
    (duration.as_millis() as usize * LEVELS_PER_SECOND / 1000).max(1)
}

fn from_db(db: f32) -> f32 {
    10_f32.powf(db / 20.0)
}

pub struct Detector {
    min: usize,
    max: usize,
    pause: usize,
    rise: f32,
    floor: Option<f32>,
    start: usize,
    levels: Vec<f32>,
    loud: Vec<bool>,
    quiet_run: usize,
}

impl Detector {
    pub fn new(policy: &Policy) -> Self {
        Self {
            min: levels_in(Duration::from_secs(u64::from(policy.min_seconds))),
            max: levels_in(Duration::from_secs(u64::from(policy.max_seconds))),
            pause: levels_in(Duration::from_millis(u64::from(policy.pause_ms))),
            rise: from_db(FLOOR_RISE_DB_PER_SECOND / LEVELS_PER_SECOND as f32),
            floor: None,
            start: 0,
            levels: Vec::new(),
            loud: Vec::new(),
            quiet_run: 0,
        }
    }

    pub fn push(&mut self, level: f32) {
        let digital_silence = level <= 0.0;
        let level = level.max(LOWEST_LEVEL);
        if !digital_silence {
            self.floor = Some(
                self.floor
                    .map_or(level, |floor| (floor * self.rise).min(level)),
            );
        }
        let above_floor = self.floor.map_or(0.0, |floor| {
            (floor * from_db(QUIET_ABOVE_FLOOR_DB)).min(from_db(LOUDEST_QUIET_DBFS))
        });
        let quiet = level <= above_floor.max(from_db(ALWAYS_QUIET_DBFS));
        self.quiet_run = if quiet { self.quiet_run + 1 } else { 0 };
        self.levels.push(level);
        self.loud.push(!quiet);
    }

    pub fn cut(&mut self, may_cut: bool) -> Option<Cut> {
        let length = self.levels.len();
        if !may_cut || length < self.min {
            return None;
        }
        if self.quiet_run >= self.pause {
            let settled = length - self.quiet_run + self.pause / 4;
            return Some(self.split(self.quietest(settled.max(self.min), length)));
        }
        if length >= self.max {
            let window = length - levels_in(FORCED_CUT_WINDOW).min(length);
            return Some(self.split(self.quietest(window, length)));
        }
        None
    }

    fn quietest(&self, from: usize, to: usize) -> usize {
        (from..to)
            .min_by(|a, b| self.levels[*a].total_cmp(&self.levels[*b]))
            .unwrap_or(to)
    }

    fn split(&mut self, at: usize) -> Cut {
        self.levels.drain(..at);
        let loud = self.loud.drain(..at).filter(|loud| *loud).count();
        self.start += at;
        self.quiet_run = self.quiet_run.min(self.levels.len());
        Cut {
            at: self.start,
            spoken: loud >= levels_in(LEAST_SPEECH),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: usize = 8_000;
    const WINDOW: usize = RATE / LEVELS_PER_SECOND;

    fn polly() -> Vec<f32> {
        let mut reader =
            hound::WavReader::new(&include_bytes!("fixtures/long-speech.wav")[..]).unwrap();
        assert_eq!(reader.spec().sample_rate as usize, RATE);
        reader
            .samples::<i16>()
            .map(|sample| f32::from(sample.unwrap()) / 32_768.0)
            .collect()
    }

    fn noise(samples: &mut [f32], dbfs: f32, seed: u32) {
        let amplitude = from_db(dbfs) * 3_f32.sqrt();
        let mut state = seed;
        for sample in samples {
            state = state.wrapping_mul(1_103_515_245).wrapping_add(12_345);
            let uniform = f32::from((state >> 16) as u16) / 65_535.0 * 2.0 - 1.0;
            *sample += uniform * amplitude;
        }
    }

    fn levels(samples: &[f32]) -> Vec<f32> {
        samples
            .as_chunks::<WINDOW>()
            .0
            .iter()
            .map(|frame| (frame.iter().map(|s| s * s).sum::<f32>() / WINDOW as f32).sqrt())
            .collect()
    }

    fn speaking(clean: &[f32]) -> Vec<bool> {
        levels(clean)
            .iter()
            .map(|level| *level > from_db(-50.0))
            .collect()
    }

    fn detect(levels: &[f32], policy: &Policy, may_cut: impl Fn(usize) -> bool) -> Vec<Cut> {
        let mut detector = Detector::new(policy);
        let mut cuts = Vec::new();
        for (index, level) in levels.iter().enumerate() {
            detector.push(*level);
            if index % 10 == 9
                && let Some(cut) = detector.cut(may_cut(index))
            {
                cuts.push(cut);
            }
        }
        cuts
    }

    fn cuts(levels: &[f32], policy: &Policy, may_cut: impl Fn(usize) -> bool) -> Vec<usize> {
        detect(levels, policy, may_cut)
            .into_iter()
            .map(|cut| cut.at)
            .collect()
    }

    fn assert_in_pauses(cuts: &[usize], speech: &[bool]) {
        for cut in cuts {
            let around = cut.saturating_sub(5)..(cut + 5).min(speech.len());
            assert!(
                speech[around].iter().all(|speaking| !speaking),
                "cut at {:.2} s lands in speech",
                *cut as f32 / 100.0
            );
        }
    }

    fn assert_lengths(cuts: &[usize], policy: &Policy) {
        let mut start = 0;
        for cut in cuts {
            let length = cut - start;
            assert!(
                length >= policy.min_seconds as usize * 100
                    && length <= policy.max_seconds as usize * 100,
                "segment of {:.2} s",
                length as f32 / 100.0
            );
            start = *cut;
        }
    }

    #[test]
    fn long_speech_with_room_noise_is_cut_only_inside_its_pauses() {
        let clean = polly();
        let speech = speaking(&clean);
        for (dbfs, policy) in [
            (-65.0, TEN_TWENTY),
            (-50.0, TEN_TWENTY),
            (
                -60.0,
                Policy {
                    min_seconds: 20,
                    max_seconds: 30,
                    ..TEN_TWENTY
                },
            ),
        ] {
            let mut noisy = clean.clone();
            noise(&mut noisy, dbfs, 7);
            let cuts = cuts(&levels(&noisy), &policy, |_| true);
            assert!(cuts.len() >= 2, "{dbfs} dBFS {policy:?}: {cuts:?}");
            assert_in_pauses(&cuts, &speech);
            assert_lengths(&cuts, &policy);
        }
    }

    #[test]
    fn digital_zeros_never_hide_the_pauses_around_them() {
        let speech = from_db(-20.0);
        let breath = from_db(-52.0);
        let mut levels = vec![0.0; 200];
        let mut pauses = Vec::new();
        for _ in 0..10 {
            levels.extend(std::iter::repeat_n(speech, 230));
            let start = levels.len();
            levels.extend(std::iter::repeat_n(breath, 15));
            levels.extend(std::iter::repeat_n(0.0, 40));
            levels.extend(std::iter::repeat_n(breath, 15));
            pauses.push(start..levels.len());
        }
        let cuts = cuts(&levels, &TEN_TWENTY, |_| true);
        assert_eq!(cuts.len(), 2, "{cuts:?}");
        assert!(pauses[2].contains(&cuts[0]), "{cuts:?}");
        assert!(
            cuts.iter()
                .all(|cut| pauses.iter().any(|pause| pause.contains(cut))),
            "{cuts:?}"
        );
    }

    #[test]
    fn a_long_hands_free_silence_never_moves_a_cut_into_speech() {
        let clean = polly();
        let gap = vec![0.0; RATE * 15];
        let middle = 17 * RATE;
        let stitched = [&clean[..middle], &gap, &clean[middle..]].concat();
        let speech = speaking(&stitched);
        let mut noisy = stitched;
        noise(&mut noisy, -58.0, 11);
        let detected = detect(&levels(&noisy), &TEN_TWENTY, |_| true);
        let cuts = detected.iter().map(|cut| cut.at).collect::<Vec<_>>();
        assert!(cuts.len() >= 3, "{cuts:?}");
        assert_in_pauses(&cuts, &speech);
        let silent = detected
            .iter()
            .filter(|cut| !cut.spoken)
            .map(|cut| cut.at)
            .collect::<Vec<_>>();
        assert_eq!(silent.len(), 1, "{detected:?}");
        assert!((2_000..3_300).contains(&silent[0]), "{silent:?}");
        assert!(detected[0].spoken);
    }

    #[test]
    fn a_segment_keeps_growing_while_a_request_is_in_flight() {
        let mut noisy = polly();
        noise(&mut noisy, -60.0, 3);
        let levels = levels(&noisy);
        let long = Policy {
            max_seconds: 30,
            ..TEN_TWENTY
        };
        let free = cuts(&levels, &long, |_| true);
        let busy = cuts(&levels, &long, |index| index >= 1_800);
        assert!(free[0] < 1_800, "{free:?}");
        assert!(busy[0] > 2_500, "{busy:?}");
        assert_in_pauses(&busy[..1], &speaking(&polly()));
        let overdue = cuts(&levels, &TEN_TWENTY, |index| index >= 2_999);
        let quietest = (2_900..3_000)
            .min_by(|a, b| levels[*a].total_cmp(&levels[*b]))
            .unwrap();
        assert_eq!(overdue[0], quietest);
    }

    #[test]
    fn speech_without_a_long_pause_is_forced_at_the_quietest_level_of_the_last_second() {
        let clean = polly();
        let speech = &clean[(7_800 * RATE / 1000)..(16_400 * RATE / 1000)];
        let mut noisy = speech.to_vec();
        noise(&mut noisy, -60.0, 5);
        let levels = levels(&noisy);
        let policy = Policy {
            min_seconds: 3,
            max_seconds: 5,
            ..TEN_TWENTY
        };
        let cuts = cuts(&levels, &policy, |_| true);
        assert!(!cuts.is_empty());
        let mut start: usize = 0;
        for cut in cuts {
            let decided = (start + 500).div_ceil(10) * 10;
            let window = &levels[decided - 100..decided];
            let quietest = window.iter().copied().fold(f32::MAX, f32::min);
            assert_eq!(levels[cut], quietest, "cut at {cut}");
            assert!(cut + 100 >= decided && cut < decided);
            start = cut;
        }
    }

    #[test]
    fn a_take_shorter_than_the_minimum_is_never_cut() {
        let mut noisy = polly()[..9 * RATE].to_vec();
        noise(&mut noisy, -60.0, 1);
        assert!(cuts(&levels(&noisy), &TEN_TWENTY, |_| true).is_empty());
    }

    #[test]
    fn an_invalid_policy_falls_back_to_the_default_but_keeps_its_switch() {
        let off = Policy {
            enabled: false,
            min_seconds: 30,
            max_seconds: 20,
            ..Policy::default()
        };
        assert_eq!(
            off.checked(),
            Policy {
                enabled: false,
                ..Policy::default()
            }
        );
        let unset: Policy = serde_json::from_str(r#"{"minSeconds":10,"maxSeconds":20}"#).unwrap();
        assert!(!unset.enabled);
        let chosen: Policy =
            serde_json::from_str(r#"{"enabled":true,"minSeconds":10,"maxSeconds":20}"#).unwrap();
        assert_eq!(chosen.checked(), TEN_TWENTY);
    }

    #[derive(Deserialize)]
    struct CutClip {
        id: String,
        wav: String,
    }

    #[derive(Deserialize)]
    struct CutPlan {
        policies: Vec<Policy>,
        clips: Vec<CutClip>,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CutPoint {
        at_ms: usize,
        spoken: bool,
        pause: bool,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ClipCuts {
        id: String,
        policy: Policy,
        audio_ms: usize,
        cuts: Vec<CutPoint>,
        gaps_ms: Vec<usize>,
    }

    fn gaps(levels: &[f32]) -> Vec<usize> {
        let mut detector = Detector::new(&TEN_TWENTY);
        let mut gaps = Vec::new();
        for level in levels {
            let before = detector.quiet_run;
            detector.push(*level);
            if detector.quiet_run == 0 && before > 0 {
                gaps.push(before * 1000 / LEVELS_PER_SECOND);
            }
        }
        gaps
    }

    fn levels_of(captured: &crate::audio::Captured) -> Vec<f32> {
        let mut buffer = crate::audio::CaptureBuffer::new(captured.channels, captured.sample_rate);
        buffer.extend(captured.samples.iter().copied());
        buffer.levels_from(0)
    }

    fn session_cuts(levels: &[f32], policy: &Policy) -> Vec<CutPoint> {
        let mut detector = Detector::new(policy);
        let mut points = Vec::new();
        for poll in levels.chunks(LEVELS_PER_SECOND / 10) {
            for level in poll {
                detector.push(*level);
            }
            let pause = detector.quiet_run >= detector.pause;
            if let Some(cut) = detector.cut(true) {
                points.push(CutPoint {
                    at_ms: cut.at * 1000 / LEVELS_PER_SECOND,
                    spoken: cut.spoken,
                    pause,
                });
            }
        }
        points
    }

    #[test]
    #[ignore = "writes the cut points of the clips in TMW_CUTS_PLAN to TMW_CUTS_OUT"]
    fn writes_the_cut_points_a_session_makes_with_nothing_in_flight() {
        let (Ok(plan), Ok(out)) = (
            std::env::var("TMW_CUTS_PLAN"),
            std::env::var("TMW_CUTS_OUT"),
        ) else {
            eprintln!("skipped: TMW_CUTS_PLAN and TMW_CUTS_OUT are not both set");
            return;
        };
        let plan: CutPlan = serde_json::from_slice(&std::fs::read(plan).unwrap()).unwrap();
        let mut written = Vec::new();
        for clip in &plan.clips {
            let captured = crate::dev::read_wav(std::path::Path::new(&clip.wav)).unwrap();
            let levels = levels_of(&captured);
            for policy in &plan.policies {
                let policy = policy.checked();
                written.push(ClipCuts {
                    id: clip.id.clone(),
                    policy,
                    audio_ms: captured.duration().as_millis() as usize,
                    cuts: session_cuts(&levels, &policy),
                    gaps_ms: gaps(&levels),
                });
            }
        }
        std::fs::write(out, serde_json::to_vec_pretty(&written).unwrap()).unwrap();
    }
}
