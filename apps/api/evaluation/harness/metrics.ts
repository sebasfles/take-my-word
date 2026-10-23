import type { Language } from "@take-my-word/shared";
import silencePhrases from "../../src/dictation/silence-phrases.json" with { type: "json" };
import { normalizeTranscript } from "../../src/dictation/silence.ts";

export const typographic = (text: string): string =>
  text
    .normalize("NFC")
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[“”«»„]/g, '"');

export const wordsOf = (text: string): string[] =>
  typographic(text)
    .toLowerCase()
    .split(/[\s.,;:!?¿¡"()]+/)
    .map((word) => word.replace(/^[-']+|[-']+$/g, ""))
    .filter((word) => word !== "");

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export function hasTerm(text: string, term: string, { exact = false } = {}): boolean {
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escape(typographic(term))}($|[^\\p{L}\\p{N}])`,
    exact ? "u" : "iu",
  ).test(typographic(text));
}

export function missedTerms(
  text: string,
  terms: readonly string[],
  options: { exact?: boolean } = {},
): string[] {
  return terms.filter((term) => !hasTerm(text, term, options));
}

export type EditOp = "=" | "S" | "D" | "I";

export interface WordErrors {
  errors: number;
  words: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  longestInsertionRun: number;
}

export function align(reference: readonly string[], hypothesis: readonly string[]): EditOp[] {
  const rows = reference.length + 1;
  const columns = hypothesis.length + 1;
  const cost: number[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => (row === 0 ? column : column === 0 ? row : 0)),
  );
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const same = reference[row - 1] === hypothesis[column - 1] ? 0 : 1;
      const current = cost[row] as number[];
      const previous = cost[row - 1] as number[];
      current[column] = Math.min(
        (previous[column - 1] as number) + same,
        (previous[column] as number) + 1,
        (current[column - 1] as number) + 1,
      );
    }
  }
  const ops: EditOp[] = [];
  let row = reference.length;
  let column = hypothesis.length;
  const at = (r: number, c: number) => (cost[r] as number[])[c] as number;
  while (row > 0 || column > 0) {
    if (row > 0 && column > 0) {
      const same = reference[row - 1] === hypothesis[column - 1];
      if (at(row, column) === at(row - 1, column - 1) + (same ? 0 : 1)) {
        ops.push(same ? "=" : "S");
        row -= 1;
        column -= 1;
        continue;
      }
    }
    if (row > 0 && at(row, column) === at(row - 1, column) + 1) {
      ops.push("D");
      row -= 1;
      continue;
    }
    ops.push("I");
    column -= 1;
  }
  return ops.reverse();
}

export const recognitionTokens = (text: string): string[] =>
  wordsOf(text).flatMap((word) => word.split("-").filter((part) => part !== ""));

export function wordErrors(reference: string, hypothesis: string): WordErrors {
  const ops = align(recognitionTokens(reference), recognitionTokens(hypothesis));
  let longestInsertionRun = 0;
  let run = 0;
  for (const op of ops) {
    run = op === "I" ? run + 1 : 0;
    longestInsertionRun = Math.max(longestInsertionRun, run);
  }
  const count = (op: EditOp) => ops.filter((candidate) => candidate === op).length;
  const substitutions = count("S");
  const deletions = count("D");
  const insertions = count("I");
  return {
    errors: substitutions + deletions + insertions,
    words: recognitionTokens(reference).length,
    substitutions,
    deletions,
    insertions,
    longestInsertionRun,
  };
}

export function bestWordErrors(references: readonly string[], hypothesis: string): WordErrors {
  const [first, ...rest] = references.map((reference) => wordErrors(reference, hypothesis));
  if (first === undefined) throw new Error("no reference text");
  return rest.reduce((best, next) => (next.errors < best.errors ? next : best), first);
}

export const inventedRunThreshold = 3;

const knownHallucinations = silencePhrases.hallucinations
  .map(normalizeTranscript)
  .filter((phrase) => phrase !== "");

export function hallucinatedPhrases(hypothesis: string, references: readonly string[]): string[] {
  const said = normalizeTranscript(hypothesis);
  const expected = references.map(normalizeTranscript);
  const found = knownHallucinations.filter(
    (phrase) =>
      ` ${said} `.includes(` ${phrase} `) &&
      !expected.some((reference) => ` ${reference} `.includes(` ${phrase} `)),
  );
  return found.filter(
    (phrase) => !found.some((other) => other !== phrase && ` ${other} `.includes(` ${phrase} `)),
  );
}

const stopwords: Readonly<Record<Language, ReadonlySet<string>>> = {
  es: new Set(
    "de la que el en y los del se las por un para con una su al lo como más pero sus ya o este porque esta cuando muy sin sobre también hasta hay donde desde nos durante uno ni ese eso qué mi es son está estoy tengo hacer hay mañana después todavía así".split(
      " ",
    ),
  ),
  en: new Set(
    "the of and to in is it you that was for on are with as i his they be at have this from or had by but what we can out were all there when your how an each she which do their if will about then them would like so these her has more could did my after let's i'll it's don't can't we're tomorrow".split(
      " ",
    ),
  ),
};

export const minimumStopwordsForVerdict = 3;

export function dominantLanguage(text: string): Language | undefined {
  const words = wordsOf(text);
  const es = words.filter((word) => stopwords.es.has(word)).length;
  const en = words.filter((word) => stopwords.en.has(word)).length;
  if (es + en < minimumStopwordsForVerdict || es === en) return undefined;
  return es > en ? "es" : "en";
}

export function percentile(values: readonly number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function sumDistribution(first: readonly number[], second: readonly number[]): number[] {
  return first.flatMap((a) => second.map((b) => a + b));
}

export function spread(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
