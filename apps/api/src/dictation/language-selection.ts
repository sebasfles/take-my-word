import type { Language } from "@take-my-word/shared";
import type { Transcript } from "./ports/transcriber.ts";

export interface ChosenTranscript {
  text: string;
  language: Language;
}

export async function transcribeIn(
  languages: readonly Language[],
  transcribe: (language?: Language) => Promise<Transcript>,
  requested?: Language,
): Promise<ChosenTranscript> {
  if (requested !== undefined && languages.includes(requested)) {
    const transcript = await transcribe(requested);
    return { text: transcript.text, language: requested };
  }
  const first = languages[0] ?? "en";
  if (languages.length > 1) {
    const detected = await transcribe();
    if (detected.language !== undefined && languages.includes(detected.language)) {
      return { text: detected.text, language: detected.language };
    }
  }
  const transcript = await transcribe(first);
  return { text: transcript.text, language: first };
}
