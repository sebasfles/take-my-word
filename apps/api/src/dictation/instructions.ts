import type { Language } from "@take-my-word/shared";
import { correctionTable, type ProjectedTerm } from "./dictionary-projection.ts";
import { plainV1 } from "./prompts/plain.v1.ts";

const headings: Readonly<Record<Language, { style: string; dictionary: string }>> = {
  es: {
    style:
      "Estilo: ajusta el tono y el registro según estas indicaciones; todas las demás reglas anteriores siguen valiendo.",
    dictionary:
      "Diccionario personal: escribe estos términos exactamente así. Entre paréntesis, cómo puede sonar o quedar mal transcrito cada uno; corrígelo solo cuando el hablante claramente lo dijo y nunca lo agregues.",
  },
  en: {
    style:
      "Style: adjust tone and register following these directions; every other rule above still applies.",
    dictionary:
      "Personal dictionary: spell these terms exactly like this. In parentheses, how each one may sound or be mistranscribed; correct it only when the speaker clearly said it and never add it.",
  },
};

export function refinerInstructions(
  language: Language,
  stylePrompt: string,
  terms: readonly ProjectedTerm[],
): string {
  const sections = [plainV1[language]];
  if (stylePrompt !== "") sections.push(`${headings[language].style}\n${stylePrompt}`);
  if (terms.length > 0) {
    sections.push(`${headings[language].dictionary}\n${correctionTable(terms)}`);
  }
  return sections.join("\n\n");
}
