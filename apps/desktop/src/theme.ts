import type { Theme } from "./bridge.ts";

export function themeFromSearch(search: string): Theme | null {
  const requested = new URLSearchParams(search).get("theme");
  return requested === "light" || requested === "dark" ? requested : null;
}

export function applyTheme(theme: Theme | null): void {
  if (theme === null) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
