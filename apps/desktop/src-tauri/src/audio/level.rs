use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

const WINDOW: Duration = Duration::from_millis(50);
const FLOOR_DB: f32 = -50.0;
const CEILING_DB: f32 = -10.0;

#[derive(Clone, Debug, Default)]
pub struct Level(Arc<AtomicU32>);

impl Level {
    pub fn set(&self, level: f32) {
        self.0.store(level.to_bits(), Ordering::Relaxed);
    }

    pub fn get(&self) -> f32 {
        f32::from_bits(self.0.load(Ordering::Relaxed))
    }
}

pub struct Meter {
    window: usize,
    sum: f32,
    count: usize,
}

impl Meter {
    pub fn new(channels: u16, sample_rate: u32) -> Self {
        let per_second = sample_rate as usize * usize::from(channels.max(1));
        Self {
            window: (per_second * WINDOW.as_millis() as usize / 1000).max(1),
            sum: 0.0,
            count: 0,
        }
    }

    pub fn push(&mut self, sample: f32) -> Option<f32> {
        self.sum += sample * sample;
        self.count += 1;
        if self.count < self.window {
            return None;
        }
        let rms = (self.sum / self.count as f32).sqrt();
        self.sum = 0.0;
        self.count = 0;
        Some(display(rms))
    }
}

fn display(rms: f32) -> f32 {
    if rms <= 0.0 {
        return 0.0;
    }
    let db = 20.0 * rms.log10();
    ((db - FLOOR_DB) / (CEILING_DB - FLOOR_DB)).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn levels(samples: &[f32], sample_rate: u32) -> Vec<f32> {
        let mut meter = Meter::new(1, sample_rate);
        samples
            .iter()
            .filter_map(|sample| meter.push(*sample))
            .collect()
    }

    fn speech() -> (Vec<f32>, u32) {
        let mut reader = hound::WavReader::new(&include_bytes!("fixtures/speech.wav")[..]).unwrap();
        let rate = reader.spec().sample_rate;
        let samples = reader
            .samples::<i16>()
            .map(|sample| f32::from(sample.unwrap()) / 32768.0)
            .collect();
        (samples, rate)
    }

    #[test]
    fn speech_moves_the_level_every_fifty_milliseconds() {
        let (samples, rate) = speech();
        let levels = levels(&samples, rate);
        assert_eq!(levels.len(), samples.len() / (rate as usize / 20));
        let loud = levels.iter().filter(|level| **level > 0.5).count();
        let quiet = levels.iter().filter(|level| **level < 0.1).count();
        assert!(loud * 3 > levels.len(), "{levels:?}");
        assert!(quiet > 0, "pauses between words read as low: {levels:?}");
    }

    #[test]
    fn silence_and_a_quiet_room_stay_flat() {
        let silence = vec![0.0_f32; 16_000];
        assert!(levels(&silence, 16_000).iter().all(|level| *level == 0.0));
        let mut state = 12_345_u32;
        let room = (0..16_000)
            .map(|_| {
                state = state.wrapping_mul(1_103_515_245).wrapping_add(12_345);
                (f32::from((state >> 16) as u16) / 65_535.0 - 0.5) * 0.004
            })
            .collect::<Vec<_>>();
        assert!(levels(&room, 16_000).iter().all(|level| *level == 0.0));
    }
}
