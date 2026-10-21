import { minAudioSeconds, type AudioContainer } from "@take-my-word/shared";
import { AudioTooShortError } from "./invalid-audio.ts";
import { m4aSeconds } from "./m4a.ts";
import { wavSeconds } from "./wav.ts";

export function chargeableSeconds(container: AudioContainer, bytes: Buffer): number {
  const seconds = container === "wav" ? wavSeconds(bytes) : m4aSeconds(bytes);
  if (seconds < minAudioSeconds) throw new AudioTooShortError();
  return seconds;
}
