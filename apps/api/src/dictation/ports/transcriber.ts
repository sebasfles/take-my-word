import type { AudioContainer, Language } from "@take-my-word/shared";

export interface TranscribeInput {
  audio: Buffer;
  container: AudioContainer;
  language?: Language;
  prompt?: string;
}

export interface TranscriptionUsage {
  seconds?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface Transcript {
  text: string;
  language?: Language;
  usage?: TranscriptionUsage;
}

export interface Transcriber {
  readonly label: string;
  transcribe(input: TranscribeInput): Promise<Transcript>;
}
