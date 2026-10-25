import { rankTerms, type RankableTerm } from "@take-my-word/shared";

export interface ProjectedTerm extends RankableTerm {
  aliases: readonly string[];
}

export function estimateTokens(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export function transcriberPrompt(
  terms: readonly ProjectedTerm[],
  { now, halfLifeDays, tokenBudget }: { now: Date; halfLifeDays: number; tokenBudget: number },
): { prompt: string; terms: number } {
  let prompt = "";
  let included = 0;
  for (const { term } of rankTerms(terms, now, halfLifeDays)) {
    const candidate = prompt === "" ? term : `${prompt}, ${term}`;
    if (estimateTokens(candidate) > tokenBudget) continue;
    prompt = candidate;
    included += 1;
  }
  return { prompt, terms: included };
}

export function correctionTable(terms: readonly ProjectedTerm[]): string {
  return terms
    .map(({ term, aliases }) =>
      aliases.length > 0 ? `- ${term} (${aliases.join(", ")})` : `- ${term}`,
    )
    .join("\n");
}

function tailWithin(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  if (estimateTokens(text) <= maxBytes) return text;
  const chars = Array.from(text);
  let start = chars.length;
  let bytes = 0;
  while (start > 0) {
    const size = estimateTokens(chars[start - 1] ?? "");
    if (bytes + size > maxBytes) break;
    bytes += size;
    start -= 1;
  }
  const tail = chars.slice(start).join("");
  if (/\s/u.test(chars[start - 1] ?? "")) return tail.trimStart();
  const space = tail.search(/\s/u);
  return space === -1 ? "" : tail.slice(space).trimStart();
}

export function promptWithPreviousText(
  termsPrompt: string,
  previous: string,
  tokenBudget: number,
): { prompt: string; tailBytes: number } {
  const separator = termsPrompt === "" ? "" : ". ";
  const room = tokenBudget - estimateTokens(termsPrompt) - estimateTokens(separator);
  const tail = tailWithin(previous.replace(/\s+/gu, " ").trim(), room);
  if (tail === "") return { prompt: termsPrompt, tailBytes: 0 };
  return { prompt: `${termsPrompt}${separator}${tail}`, tailBytes: estimateTokens(tail) };
}
