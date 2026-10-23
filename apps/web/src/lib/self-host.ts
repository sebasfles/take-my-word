import type { Locale } from "./locale.ts";

export const pricesCheckedOn = "2026-10-23";

export function checkedOnText(locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${pricesCheckedOn}T00:00:00Z`));
}

export type InlinePart = { code: boolean; text: string };

export function inlineCode(text: string): InlinePart[] {
  return text
    .split("`")
    .map((part, index) => ({ code: index % 2 === 1, text: part }))
    .filter((part) => part.text !== "");
}
