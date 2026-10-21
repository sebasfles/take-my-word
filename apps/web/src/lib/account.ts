import {
  builtinStyleIds,
  historyLimits,
  historyQuerySchema,
  rankTerms,
  type BuiltinStyleId,
  type DictionaryTerm,
  type PasteKeystroke,
  type RefinerId,
  type Style,
  type TranscriberId,
} from "@take-my-word/shared";
import { maxHistoryShown, type Loaded } from "./api.ts";
import type { Dictionary } from "./i18n.ts";

export function isBuiltinStyle(styleId: string): styleId is BuiltinStyleId {
  return (builtinStyleIds as readonly string[]).includes(styleId);
}

export function styleLabel(
  styleId: string | undefined,
  styles: readonly Style[],
  t: Dictionary["styles"],
): { name: string; fallback: boolean } {
  if (styleId === undefined) return { name: t.fallback, fallback: true };
  if (isBuiltinStyle(styleId)) return { name: t.names[styleId], fallback: false };
  const custom = styles.find((style) => style.id === styleId && !style.builtin);
  return custom === undefined
    ? { name: t.deleted, fallback: true }
    : { name: custom.name, fallback: false };
}

export type TermSort = "relevance" | "name";

export function termSort(value: string | string[] | undefined): TermSort {
  return value === "name" ? "name" : "relevance";
}

export function sortTerms(
  terms: readonly DictionaryTerm[],
  sort: TermSort,
  now: Date,
  locale: string,
): DictionaryTerm[] {
  if (sort === "relevance") return rankTerms(terms, now);
  return [...terms].sort(
    (a, b) =>
      a.term.localeCompare(b.term, locale, { sensitivity: "base" }) || a.term.localeCompare(b.term),
  );
}

export interface HistoryView {
  limit: number;
  pages: number;
  shown: number;
}

type SearchValue = string | string[] | undefined;

export function historyView(params: { limit?: SearchValue; pages?: SearchValue }): HistoryView {
  const parsedLimit = historyQuerySchema.shape.limit.safeParse(params.limit);
  const limit = parsedLimit.success ? parsedLimit.data : historyLimits.defaultPageSize;
  const maxPages = Math.ceil(maxHistoryShown / limit);
  const requested = typeof params.pages === "string" ? Number(params.pages) : 1;
  const pages = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), maxPages) : 1;
  return { limit, pages, shown: Math.min(limit * pages, maxHistoryShown) };
}

export function nextHistoryHref(view: HistoryView): string | null {
  if (view.shown >= maxHistoryShown) return null;
  const query = new URLSearchParams({ pages: String(view.pages + 1) });
  if (view.limit !== historyLimits.defaultPageSize) query.set("limit", String(view.limit));
  return `/app/history?${query.toString()}`;
}

export function bothLoaded<A, B>([a, b]: [Loaded<A>, Loaded<B>]): Loaded<[A, B]> {
  return a.kind === "ok" && b.kind === "ok"
    ? { kind: "ok", value: [a.value, b.value] }
    : { kind: "failed" };
}

export function formatDate(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

export function formatSeconds(seconds: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds)} s`;
}

export function languageName(tag: string, locale: string): string {
  let name: string;
  try {
    name =
      new Intl.DisplayNames(locale, { type: "language", languageDisplay: "standard" }).of(tag) ??
      tag;
  } catch {
    name = tag;
  }
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

export const transcriberNames: Readonly<Record<TranscriberId, string>> = {
  "groq-whisper": "Groq Whisper",
};

export const refinerNames: Readonly<Record<RefinerId, string>> = { openai: "OpenAI" };

export const keystrokeKeys: Readonly<Record<PasteKeystroke, readonly string[]>> = {
  "ctrl+v": ["Ctrl", "V"],
  "ctrl+shift+v": ["Ctrl", "Shift", "V"],
  "shift+insert": ["Shift", "Insert"],
  "cmd+v": ["Cmd", "V"],
};
