import { describe, expect, it } from "vitest";
import { createSilenceGuard } from "./silence.ts";

describe("silence guard", () => {
  const isSilence = createSilenceGuard({ noSpeechThreshold: 0.6 });

  it.each(["", "   ", "\n"])("treats the empty transcript %j as silence", (text) => {
    expect(isSilence({ text, noSpeechProbability: 0.01 })).toBe(true);
  });

  it.each([
    "[Música]",
    "[BLANK_AUDIO]",
    "Subtítulos realizados por la comunidad de Amara.org",
    "¡Gracias por ver el video!",
    "suscríbete",
  ])("treats the hallucination %j as silence whatever the speech signal", (text) => {
    expect(isSilence({ text, noSpeechProbability: 0.01 })).toBe(true);
    expect(isSilence({ text })).toBe(true);
  });

  it.each(["Gracias.", "¡Gracias!", "Thank you.", "Chao."])(
    "treats %j as silence when the transcriber reports no speech",
    (text) => {
      expect(isSilence({ text, noSpeechProbability: 0.92 })).toBe(true);
      expect(isSilence({ text, noSpeechProbability: 0.6 })).toBe(true);
    },
  );

  it.each(["Gracias.", "Thank you.", "Chao."])(
    "keeps %j when the transcriber heard speech or gave no signal",
    (text) => {
      expect(isSilence({ text, noSpeechProbability: 0.05 })).toBe(false);
      expect(isSilence({ text, noSpeechProbability: 0.59 })).toBe(false);
      expect(isSilence({ text })).toBe(false);
    },
  );

  it.each([
    "Gracias por la reunión de hoy, te escribo mañana.",
    "Thank you for the review, merging now.",
    "Música para la fiesta del viernes",
  ])("keeps %j even with a high no-speech signal", (text) => {
    expect(isSilence({ text, noSpeechProbability: 0.95 })).toBe(false);
  });
});
