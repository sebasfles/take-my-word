import { describe, expect, it } from "vitest";
import { createSilenceGuard } from "./silence.ts";

describe("silence guard", () => {
  const isSilence = createSilenceGuard();

  it.each(["", "   ", "\n"])("treats the empty transcript %j as silence", (text) => {
    expect(isSilence({ text, quiet: false })).toBe(true);
  });

  it.each([
    "[Música]",
    "[BLANK_AUDIO]",
    "Subtítulos realizados por la comunidad de Amara.org",
    "¡Gracias por ver el video!",
    "suscríbete",
  ])("treats the hallucination %j as silence however loud the audio", (text) => {
    expect(isSilence({ text, quiet: false })).toBe(true);
    expect(isSilence({ text, quiet: true })).toBe(true);
  });

  it.each(["Gracias.", "¡Gracias!", "Thank you.", "Chao."])(
    "treats %j as silence on quiet audio and keeps it on speech-level audio",
    (text) => {
      expect(isSilence({ text, quiet: true })).toBe(true);
      expect(isSilence({ text, quiet: false })).toBe(false);
    },
  );

  it.each([
    "Gracias por la reunión de hoy, te escribo mañana.",
    "Thank you for the review, merging now.",
    "Música para la fiesta del viernes",
  ])("keeps %j even on quiet audio", (text) => {
    expect(isSilence({ text, quiet: true })).toBe(false);
  });
});
