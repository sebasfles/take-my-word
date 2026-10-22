import { type ComponentType, useEffect, useState } from "react";
import { bridge, keepListening } from "./bridge.ts";
import { type Language, setLanguage } from "./i18n.ts";

export function LanguageRoot({
  initial,
  screen: Screen,
}: {
  initial: Language;
  screen: ComponentType;
}) {
  const [language, setCurrent] = useState(initial);

  useEffect(() => keepListening(() => bridge.onUiLanguage(setCurrent)), []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  setLanguage(language);
  return <Screen />;
}
