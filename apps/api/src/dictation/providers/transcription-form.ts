import type { AudioContainer, Language } from "@take-my-word/shared";

const mimeTypes: Readonly<Record<AudioContainer, string>> = { wav: "audio/wav", m4a: "audio/mp4" };

const detectedLanguages: Readonly<Record<string, Language>> = {
  en: "en",
  english: "en",
  es: "es",
  spanish: "es",
  castilian: "es",
};

export function detectedLanguage(name: string | undefined): Language | undefined {
  return name === undefined ? undefined : detectedLanguages[name.trim().toLowerCase()];
}

export function appendAudio(form: FormData, audio: Buffer, container: AudioContainer): void {
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: mimeTypes[container] }),
    `audio.${container}`,
  );
}
