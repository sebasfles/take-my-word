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
