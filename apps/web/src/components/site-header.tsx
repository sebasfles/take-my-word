import type { ReactNode } from "react";
import type { Dictionary, Locale } from "@/lib/i18n.ts";
import type { Theme } from "@/lib/theme.ts";
import { Brand } from "./brand.tsx";
import { LocaleSwitch } from "./locale-switch.tsx";
import { ThemeSwitch } from "./theme-switch.tsx";

export function SiteHeader(props: {
  locale: Locale;
  theme: Theme;
  t: Dictionary;
  brandHref: string;
  nav?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Brand href={props.brandHref} label={props.t.meta.title} />
        {props.nav}
        <div className="site-header-actions">
          {props.children}
          <ThemeSwitch initial={props.theme} t={props.t.theme} />
          <LocaleSwitch
            target={props.locale === "es" ? "en" : "es"}
            text={props.t.locale.switchTo}
            label={props.t.locale.switchLabel}
          />
        </div>
      </div>
    </header>
  );
}
