import { type ComponentType, useEffect, useState } from "react";
import { bridge, keepListening, type Theme } from "./bridge.ts";
import { type Language, setLanguage } from "./i18n.ts";
import { forwardKeys } from "./keys.ts";
import { applyTheme } from "./theme.ts";

export function Root({
  language: initial,
  theme,
  followsTheme = true,
  forwardsKeys = false,
  screen: Screen,
}: {
  language: Language;
  theme: Theme | null;
  followsTheme?: boolean;
  forwardsKeys?: boolean;
  screen: ComponentType;
}) {
  const [language, setCurrent] = useState(initial);

  useEffect(() => keepListening(() => bridge.onUiLanguage(setCurrent)), []);

  useEffect(() => {
    applyTheme(theme);
    if (followsTheme) return keepListening(() => bridge.onTheme(applyTheme));
  }, [theme, followsTheme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (forwardsKeys) return forwardKeys(window);
  }, [forwardsKeys]);

  setLanguage(language);
  return <Screen />;
}
