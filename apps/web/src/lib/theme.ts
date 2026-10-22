import { tokens } from "@take-my-word/brand";

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];
export const themeCookieName = "tmw-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (themes as readonly string[]).includes(value);
}

export function themeFrom(cookieValue: string | undefined): Theme {
  return isTheme(cookieValue) ? cookieValue : "system";
}

export function themeAttribute(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}

export type ThemeColor = string | { media: string; color: string }[];

export function themeColor(theme: Theme): ThemeColor {
  if (theme !== "system") return tokens[theme].colors.bg;
  return [
    { media: "(prefers-color-scheme: light)", color: tokens.light.colors.bg },
    { media: "(prefers-color-scheme: dark)", color: tokens.dark.colors.bg },
  ];
}
