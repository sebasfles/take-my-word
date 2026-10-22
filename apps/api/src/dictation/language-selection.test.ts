import type { Language } from "@take-my-word/shared";
import { describe, expect, it } from "vitest";
import { transcribeIn } from "./language-selection.ts";
import type { Transcript } from "./ports/transcriber.ts";

function whisper(detected: Language | undefined) {
  const calls: (Language | undefined)[] = [];
  const transcribe = (language?: Language): Promise<Transcript> => {
    calls.push(language);
    return Promise.resolve(
      language === undefined
        ? { text: "detected", ...(detected && { language: detected }) }
        : { text: `in ${language}` },
    );
  };
  return { calls, transcribe };
}

describe("transcribeIn", () => {
  it("passes a single language to the transcriber and never detects", async () => {
    const { calls, transcribe } = whisper("en");
    expect(await transcribeIn(["es"], transcribe)).toEqual({ text: "in es", language: "es" });
    expect(calls).toEqual(["es"]);
  });

  it("lets the transcriber detect among several and keeps a detected language from the list", async () => {
    const { calls, transcribe } = whisper("es");
    expect(await transcribeIn(["en", "es"], transcribe)).toEqual({
      text: "detected",
      language: "es",
    });
    expect(calls).toEqual([undefined]);
  });

  it("transcribes again in the first language when the detected one is neither", async () => {
    const unknown = whisper(undefined);
    expect(await transcribeIn(["en", "es"], unknown.transcribe)).toEqual({
      text: "in en",
      language: "en",
    });
    expect(unknown.calls).toEqual([undefined, "en"]);
  });
});
