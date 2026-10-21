import type { AudioContainer } from "@take-my-word/shared";
import { m4aDurationSeconds } from "./m4a.ts";
import { wavDurationSeconds } from "./wav.ts";

export function audioDurationSeconds(container: AudioContainer, bytes: Buffer): number {
  return container === "wav" ? wavDurationSeconds(bytes) : m4aDurationSeconds(bytes);
}
