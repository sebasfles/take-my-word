"use client";

import { useId, useSyncExternalStore } from "react";
import { Icon } from "@take-my-word/brand";
import type { Dictionary } from "@/lib/i18n.ts";
import { signedFetch } from "@/lib/signed-fetch.ts";
import { themeAttribute, themeColor, themes, type Theme } from "@/lib/theme.ts";

let chosen: Theme | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function paintBrowserChrome(theme: Theme) {
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove();
  const value = themeColor(theme);
  for (const entry of typeof value === "string" ? [{ color: value }] : value) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = entry.color;
    if ("media" in entry) meta.media = entry.media;
    document.head.append(meta);
  }
}

function choose(next: Theme) {
  chosen = next;
  const attribute = themeAttribute(next);
  if (attribute === undefined) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = attribute;
  paintBrowserChrome(next);
  for (const listener of listeners) listener();
  void signedFetch("/api/theme", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ theme: next }),
  });
}

export function ThemeSwitch({ initial, t }: { initial: Theme; t: Dictionary["theme"] }) {
  const theme = useSyncExternalStore(
    subscribe,
    () => chosen ?? initial,
    () => initial,
  );
  const name = useId();

  return (
    <fieldset className="theme-switch">
      <legend className="visually-hidden">{t.label}</legend>
      {themes.map((option) => (
        <label key={option} className="theme-option" title={t[option]}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={theme === option}
            onChange={() => {
              choose(option);
            }}
          />
          <Icon name={option} />
          <span className="visually-hidden">{t[option]}</span>
        </label>
      ))}
    </fieldset>
  );
}
