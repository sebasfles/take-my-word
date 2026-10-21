use std::time::Duration;

use super::MAX_RECORDING;

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

    pub fn duration(&self) -> Duration {
        Duration::from_secs_f64(self.frames() as f64 / f64::from(self.sample_rate.max(1)))
    }
}

#[derive(Debug)]
pub struct CaptureBuffer {
    samples: Vec<f32>,
    channels: u16,
    sample_rate: u32,
    max_samples: usize,
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
        }
    }

    pub fn extend(&mut self, samples: impl IntoIterator<Item = f32>) {
        let room = self.max_samples - self.samples.len();
        self.samples.extend(samples.into_iter().take(room));
    }

    pub fn take(&mut self) -> Captured {
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
}
