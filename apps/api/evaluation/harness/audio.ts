import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { probeWav } from "../../src/dictation/audio/wav.ts";
import { pcmToWav } from "../../e2e/speech.ts";

export const voices = {
  Lupe: "es-US",
  Pedro: "es-US",
  Mia: "es-MX",
  Andres: "es-MX",
  Joanna: "en-US",
  Matthew: "en-US",
} as const;
export type Voice = keyof typeof voices;

const sampleRate = 16_000;
const fullScale = 32_767;

export async function speak(polly: PollyClient, text: string, voice: Voice): Promise<Buffer> {
  const { AudioStream } = await polly.send(
    new SynthesizeSpeechCommand({
      Engine: "neural",
      VoiceId: voice,
      LanguageCode: voices[voice],
      OutputFormat: "pcm",
      SampleRate: String(sampleRate),
      Text: text,
    }),
  );
  if (!AudioStream) throw new Error(`Polly returned no audio for ${voice}`);
  return pcmToWav(Buffer.from(await AudioStream.transformToByteArray()));
}

export function sustainedLevel(wav: Buffer): number {
  return probeWav(wav).sustainedLevelDbfs;
}

export function seconds(wav: Buffer): number {
  return probeWav(wav).seconds;
}

function samplesOf(wav: Buffer): Int16Array {
  const pcm = wav.subarray(44);
  return new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length));
}

function wavOf(samples: Int16Array): Buffer {
  return pcmToWav(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
}

export function withLevel(wav: Buffer, targetDbfs: number): Buffer {
  const gain = 10 ** ((targetDbfs - sustainedLevel(wav)) / 20);
  const scaled = samplesOf(wav).map((sample) =>
    Math.max(-fullScale, Math.min(fullScale, Math.round(sample * gain))),
  );
  return wavOf(scaled);
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type NoiseColor = "white" | "brown";

export function noise({
  seconds: length,
  levelDbfs,
  color,
  seed,
}: {
  seconds: number;
  levelDbfs: number;
  color: NoiseColor;
  seed: number;
}): Buffer {
  const next = random(seed);
  const samples = new Int16Array(Math.round(length * sampleRate));
  let walk = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const white = next() * 2 - 1;
    walk = Math.max(-1, Math.min(1, 0.98 * walk + 0.1 * white));
    samples[index] = Math.round((color === "white" ? white : walk) * 8_000);
  }
  return withLevel(wavOf(samples), levelDbfs);
}
