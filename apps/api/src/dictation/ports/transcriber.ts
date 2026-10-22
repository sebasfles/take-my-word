import type { AudioContainer, Language } from "@take-my-word/shared";

export interface TranscribeInput {
  audio: Buffer;
  container: AudioContainer;
  language?: Language;
  prompt?: string;
}

export interface Transcript {
  text: string;
  language?: Language;
}

export interface Transcriber {
  readonly label: string;
  transcribe(input: TranscribeInput): Promise<Transcript>;
}
