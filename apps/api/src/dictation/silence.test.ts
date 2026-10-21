import { describe, expect, it } from "vitest";
import { createSilenceGuard } from "./silence.ts";

describe("silence guard", () => {
  const isSilence = createSilenceGuard();

  it.each([
    "",
    "   ",
    "\n",
    "Gracias.",
    "¡Gracias!",
    " gracias ",
    "[Música]",
    "[BLANK_AUDIO]",
    "Thank you.",
    "you",
    "Subtítulos realizados por la comunidad de Amara.org",
  ])("treats %j as silence", (raw) => {
    expect(isSilence(raw)).toBe(true);
  });

  it.each([
    "Gracias por la reunión de hoy, te escribo mañana.",
    "Thank you for the review, merging now.",
    "Música para la fiesta del viernes",
    "Hola",
  ])("keeps %j", (raw) => {
    expect(isSilence(raw)).toBe(false);
  });
});
