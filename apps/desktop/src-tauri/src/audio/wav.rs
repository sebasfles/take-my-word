use std::io::Cursor;

use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler};

use super::{AudioError, Captured};

pub const TARGET_SAMPLE_RATE: u32 = 16_000;
const RESAMPLER_CHUNK: usize = 1024;

pub fn encode_wav(captured: &Captured) -> Result<Vec<u8>, AudioError> {
    let mono = downmix(&captured.samples, captured.channels);
    let resampled = resample(mono, captured.sample_rate)?;
    write_wav(&resampled)
}

fn downmix(samples: &[f32], channels: u16) -> Vec<f32> {
    let channels = usize::from(channels.max(1));
    if channels == 1 {
        return samples.to_vec();
    }
    samples
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

fn resample(mono: Vec<f32>, from_rate: u32) -> Result<Vec<f32>, AudioError> {
    if from_rate == TARGET_SAMPLE_RATE || mono.is_empty() {
        return Ok(mono);
    }
    let encode_error = |error: &dyn std::fmt::Display| AudioError::Encode(error.to_string());
    let mut resampler = Fft::<f32>::new(
        from_rate as usize,
        TARGET_SAMPLE_RATE as usize,
        RESAMPLER_CHUNK,
        1,
        FixedSync::Both,
    )
    .map_err(|error| encode_error(&error))?;
    let input =
        InterleavedSlice::new(&mono, 1, mono.len()).map_err(|error| encode_error(&error))?;
    let output = resampler
        .process_all(&input, mono.len(), None)
        .map_err(|error| encode_error(&error))?;
    Ok(output.take_data())
}

fn write_wav(samples: &[f32]) -> Result<Vec<u8>, AudioError> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let encode_error = |error: hound::Error| AudioError::Encode(error.to_string());
    let mut cursor = Cursor::new(Vec::with_capacity(44 + samples.len() * 2));
    let mut writer = hound::WavWriter::new(&mut cursor, spec).map_err(encode_error)?;
    for sample in samples {
        writer.write_sample(to_i16(*sample)).map_err(encode_error)?;
    }
    writer.finalize().map_err(encode_error)?;
    Ok(cursor.into_inner())
}

fn to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * f32::from(i16::MAX)).round() as i16
}

#[cfg(test)]
mod tests {
    use std::f32::consts::TAU;
    use std::time::Duration;

    use super::*;

    fn tone(frequency: f32, sample_rate: u32, channels: u16, seconds: f32) -> Captured {
        let frames = (seconds * sample_rate as f32) as usize;
        let samples = (0..frames)
            .flat_map(|frame| {
                let value = 0.5 * (TAU * frequency * frame as f32 / sample_rate as f32).sin();
                std::iter::repeat_n(value, usize::from(channels))
            })
            .collect();
        Captured {
            samples,
            channels,
            sample_rate,
        }
    }

    fn decode(wav: &[u8]) -> (hound::WavSpec, Vec<i16>) {
        let mut reader = hound::WavReader::new(Cursor::new(wav)).unwrap();
        let spec = reader.spec();
        let samples = reader.samples::<i16>().map(Result::unwrap).collect();
        (spec, samples)
    }

    fn rms(samples: &[i16]) -> f64 {
        let middle = &samples[samples.len() / 10..samples.len() * 9 / 10];
        let sum: f64 = middle
            .iter()
            .map(|s| (f64::from(*s) / 32767.0).powi(2))
            .sum();
        (sum / middle.len() as f64).sqrt()
    }

    fn duration_of(samples: &[i16]) -> Duration {
        Duration::from_secs_f64(samples.len() as f64 / f64::from(TARGET_SAMPLE_RATE))
    }

    fn assert_close(actual: Duration, expected: Duration) {
        let gap = actual.abs_diff(expected);
        assert!(
            gap <= Duration::from_millis(100),
            "duration {actual:?} is {gap:?} away from {expected:?}"
        );
    }

    #[test]
    fn stereo_48k_becomes_16k_mono_16_bit_with_the_same_duration() {
        let captured = tone(440.0, 48_000, 2, 3.2);
        let (spec, samples) = decode(&encode_wav(&captured).unwrap());
        assert_eq!(spec.sample_rate, 16_000);
        assert_eq!(spec.channels, 1);
        assert_eq!(spec.bits_per_sample, 16);
        assert_eq!(spec.sample_format, hound::SampleFormat::Int);
        assert_close(duration_of(&samples), captured.duration());
    }

    #[test]
    fn odd_rates_keep_their_duration() {
        for (rate, seconds) in [(44_100, 0.7), (22_050, 1.3), (96_000, 2.0), (16_000, 0.6)] {
            let captured = tone(300.0, rate, 1, seconds);
            let (_, samples) = decode(&encode_wav(&captured).unwrap());
            assert_close(duration_of(&samples), captured.duration());
        }
    }

    #[test]
    fn a_two_minute_recording_fits_the_api_upload_limit() {
        let captured = tone(200.0, 48_000, 1, 120.0);
        let wav = encode_wav(&captured).unwrap();
        assert!(wav.len() <= 4 * 1024 * 1024, "{} bytes", wav.len());
    }

    #[test]
    fn speech_band_passes_and_content_above_8khz_is_filtered_not_aliased() {
        let (_, speech) = decode(&encode_wav(&tone(1_000.0, 48_000, 1, 1.0)).unwrap());
        let (_, hiss) = decode(&encode_wav(&tone(12_000.0, 48_000, 1, 1.0)).unwrap());
        let input_rms = 0.5 / 2_f64.sqrt();
        assert!(
            (rms(&speech) - input_rms).abs() < 0.02,
            "speech rms {}",
            rms(&speech)
        );
        assert!(rms(&hiss) < 0.01 * input_rms, "aliased rms {}", rms(&hiss));
    }

    #[test]
    fn stereo_channels_are_averaged_and_samples_clipped() {
        let captured = Captured {
            samples: vec![1.0, 0.0, 2.0, 2.0, -3.0, -3.0],
            channels: 2,
            sample_rate: TARGET_SAMPLE_RATE,
        };
        let (_, samples) = decode(&encode_wav(&captured).unwrap());
        assert_eq!(samples, vec![16384, i16::MAX, -i16::MAX]);
    }
}
