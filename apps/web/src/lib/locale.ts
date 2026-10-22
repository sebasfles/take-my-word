export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const localeCookieName = "tmw-lang";
export const localeMaxAgeSeconds = 365 * 24 * 60 * 60;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

const qualityPattern = /^q=(0(\.\d{0,3})?|1(\.0{0,3})?)$/;

export function preferredLocale(acceptLanguage: string | null | undefined): Locale {
  if (acceptLanguage === null || acceptLanguage === undefined) return defaultLocale;
  let best: { locale: Locale; quality: number } | null = null;
  for (const entry of acceptLanguage.split(",")) {
    const [range = "", ...parameters] = entry
      .trim()
      .split(";")
      .map((part) => part.trim());
    const primary = range.split("-")[0]?.toLowerCase();
    if (!isLocale(primary)) continue;
    const qualityParameter = parameters.find((parameter) => parameter.startsWith("q="));
    if (qualityParameter !== undefined && !qualityPattern.test(qualityParameter)) continue;
    const quality = qualityParameter === undefined ? 1 : Number(qualityParameter.slice(2));
    if (quality > 0 && (best === null || quality > best.quality))
      best = { locale: primary, quality };
  }
  return best?.locale ?? defaultLocale;
}

export function localeFrom(
  cookieValue: string | undefined,
  acceptLanguage?: string | null,
): Locale {
  return isLocale(cookieValue) ? cookieValue : preferredLocale(acceptLanguage);
}
