import en from "./i18n/en.json";
import es from "./i18n/es.json";

export type MessageId = keyof typeof es;
export type Language = "es" | "en";

export const dictionaries: Record<Language, Record<MessageId, string>> = { es, en };

let current: Language = "es";

export function languageFromSearch(search: string): Language {
  return new URLSearchParams(search).get("lang") === "en" ? "en" : "es";
}

export function setLanguage(language: Language): void {
  current = language;
}

export function language(): Language {
  return current;
}

export function isMessageId(value: unknown): value is MessageId {
  return typeof value === "string" && Object.hasOwn(es, value);
}

export function t(id: MessageId, values: Record<string, string | number> = {}): string {
  return dictionaries[current][id].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
