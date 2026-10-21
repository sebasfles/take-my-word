import { minAudioSeconds, type AudioContainer } from "@take-my-word/shared";
import { AudioTooShortError } from "./invalid-audio.ts";
import { m4aSeconds } from "./m4a.ts";
import { probeWav } from "./wav.ts";

export interface AudioProbe {
  seconds: number;
  sustainedLevelDbfs?: number;
}

export function probeAudio(container: AudioContainer, bytes: Buffer): AudioProbe {
  const probe = container === "wav" ? probeWav(bytes) : { seconds: m4aSeconds(bytes) };
  if (probe.seconds < minAudioSeconds) throw new AudioTooShortError();
  return probe;
}
