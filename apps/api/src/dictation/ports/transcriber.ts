import type { AudioContainer, Language } from "@take-my-word/shared";

export interface TranscribeInput {
  audio: Buffer;
  container: AudioContainer;
  language: Language;
}

export interface Transcript {
  text: string;
  noSpeechProbability?: number;
}

export interface Transcriber {
  readonly label: string;
  transcribe(input: TranscribeInput): Promise<Transcript>;
}
