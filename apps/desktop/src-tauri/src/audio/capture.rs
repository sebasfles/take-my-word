use std::time::Duration;

use super::MAX_RECORDING;

pub const LEVELS_PER_SECOND: usize = 100;

pub fn level_window(channels: u16, sample_rate: u32) -> usize {
    (sample_rate as usize / LEVELS_PER_SECOND).max(1) * usize::from(channels.max(1))
}

fn level_range(len: usize, window: usize, from: usize, to: usize) -> std::ops::Range<usize> {
    let end = to.saturating_mul(window).min(len);
    from.saturating_mul(window).min(end)..end
}

#[derive(Clone, Debug, PartialEq)]
pub struct Captured {
    pub samples: Vec<f32>,
    pub channels: u16,
    pub sample_rate: u32,
}

impl Captured {
    pub fn frames(&self) -> usize {
        self.samples.len() / usize::from(self.channels.max(1))
    }

    pub fn is_digital_silence(&self) -> bool {
        self.samples.iter().all(|sample| *sample == 0.0)
    }

    pub fn duration(&self) -> Duration {
        Duration::from_secs_f64(self.frames() as f64 / f64::from(self.sample_rate.max(1)))
    }

    pub fn between_levels(&self, from: usize, to: usize) -> Self {
        let window = level_window(self.channels, self.sample_rate);
        Self {
            samples: self.samples[level_range(self.samples.len(), window, from, to)].to_vec(),
            channels: self.channels,
            sample_rate: self.sample_rate,
        }
    }
}

#[derive(Debug)]
pub struct CaptureBuffer {
    samples: Vec<f32>,
    channels: u16,
    sample_rate: u32,
    max_samples: usize,
    levels: Vec<f32>,
    window: usize,
    energy: f32,
    counted: usize,
}

impl CaptureBuffer {
    pub fn new(channels: u16, sample_rate: u32) -> Self {
        let max_samples =
            MAX_RECORDING.as_secs() as usize * sample_rate as usize * usize::from(channels);
        Self {
            samples: Vec::with_capacity(sample_rate as usize * usize::from(channels) * 10),
            channels,
            sample_rate,
            max_samples,
            levels: Vec::new(),
            window: level_window(channels, sample_rate),
            energy: 0.0,
            counted: 0,
        }
    }

    pub fn extend(&mut self, samples: impl IntoIterator<Item = f32>) {
        let room = self.max_samples - self.samples.len();
        for sample in samples.into_iter().take(room) {
            self.samples.push(sample);
            self.energy += sample * sample;
            self.counted += 1;
            if self.counted == self.window {
                self.levels.push((self.energy / self.counted as f32).sqrt());
                self.energy = 0.0;
                self.counted = 0;
            }
        }
    }

    pub fn levels_from(&self, from: usize) -> Vec<f32> {
        self.levels[from.min(self.levels.len())..].to_vec()
    }

    pub fn between_levels(&self, from: usize, to: usize) -> Captured {
        Captured {
            samples: self.samples[level_range(self.samples.len(), self.window, from, to)].to_vec(),
            channels: self.channels,
            sample_rate: self.sample_rate,
        }
    }

    pub fn take(&mut self) -> Captured {
        self.levels.clear();
        self.energy = 0.0;
        self.counted = 0;
        Captured {
            samples: std::mem::take(&mut self.samples),
            channels: self.channels,
            sample_rate: self.sample_rate,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buffer_stops_growing_at_the_maximum_recording_length() {
        let mut buffer = CaptureBuffer::new(2, 8_000);
        let chunk = vec![0.25_f32; 8_000 * 2];
        for _ in 0..130 {
            buffer.extend(chunk.iter().copied());
        }
        let captured = buffer.take();
        assert_eq!(captured.duration(), MAX_RECORDING);
    }

    #[test]
    fn the_buffer_keeps_one_level_per_ten_milliseconds_and_slices_by_them() {
        let mut buffer = CaptureBuffer::new(2, 48_000);
        let quiet = std::iter::repeat_n(0.01_f32, 480 * 2 * 3);
        let loud = std::iter::repeat_n(0.5_f32, 480 * 2 * 2 + 7);
        buffer.extend(quiet.chain(loud));
        let levels = buffer.levels_from(0);
        assert_eq!(levels.len(), 5);
        assert!((levels[0] - 0.01).abs() < 1e-6 && (levels[4] - 0.5).abs() < 1e-6);
        assert_eq!(buffer.levels_from(4), vec![levels[4]]);
        assert!(buffer.levels_from(9).is_empty());
        let middle = buffer.between_levels(2, 4);
        assert_eq!(middle.samples.len(), 480 * 2 * 2);
        assert_eq!(middle.samples[0], 0.01);
        assert_eq!(middle.samples[480 * 2], 0.5);
        let captured = buffer.take();
        assert_eq!(
            captured.between_levels(3, 99).samples.len(),
            480 * 2 * 2 + 7
        );
        assert!(buffer.levels_from(0).is_empty());
    }
}
