import { normalizeTerm } from "@take-my-word/shared";

export interface MatchableTerm {
  key: string;
  term: string;
  aliases: readonly string[];
}

const wordChar = "[\\p{L}\\p{N}]";

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function phrasePattern(phrases: readonly string[]): RegExp | undefined {
  const forms = [...new Set(phrases.map(normalizeTerm).filter((form) => form !== ""))];
  if (forms.length === 0) return undefined;
  return new RegExp(`(?<!${wordChar})(?:${forms.map(escape).join("|")})(?!${wordChar})`, "u");
}

export function termsIn<T extends MatchableTerm>(text: string, terms: readonly T[]): T[] {
  const normalized = normalizeTerm(text);
  return terms.filter((term) => phrasePattern([term.term, ...term.aliases])?.test(normalized));
}
