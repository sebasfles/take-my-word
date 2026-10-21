"use client";

import { useId, useSyncExternalStore } from "react";
import type { Dictionary } from "@/lib/i18n.ts";
import { signedFetch } from "@/lib/signed-fetch.ts";
import { themeAttribute, themes, type Theme } from "@/lib/theme.ts";

const icons: Record<Theme, string> = {
  system: "M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3",
  light:
    "M8 5.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5zM8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9",
  dark: "M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1z",
};

let chosen: Theme | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function choose(next: Theme) {
  chosen = next;
  const attribute = themeAttribute(next);
  if (attribute === undefined) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = attribute;
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
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d={icons[option]} />
          </svg>
          <span className="visually-hidden">{t[option]}</span>
        </label>
      ))}
    </fieldset>
  );
}
