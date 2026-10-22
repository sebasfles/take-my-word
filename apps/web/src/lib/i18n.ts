import { demos, en, type DemoScript, type Dictionary } from "./copy/en.ts";
import { es } from "./copy/es.ts";
import type { Locale } from "./locale.ts";

export * from "./locale.ts";
export type { DemoScript, DemoSegment, Dictionary } from "./copy/en.ts";

export function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}

const dictionaries: Record<Locale, Dictionary> = { en, es };

export function dictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function demoScripts(locale: Locale): { primary: DemoScript; other: DemoScript } {
  return locale === "es"
    ? { primary: demos.es, other: demos.en }
    : { primary: demos.en, other: demos.es };
}
