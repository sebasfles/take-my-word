import type { ReactNode } from "react";
import type { Dictionary, Locale } from "@/lib/i18n.ts";
import { Brand } from "./brand.tsx";
import { LocaleSwitch } from "./locale-switch.tsx";

export function SiteHeader(props: {
  locale: Locale;
  t: Dictionary;
  brandHref: string;
  compactBrand?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Brand href={props.brandHref} compact={props.compactBrand ?? false} />
        <nav className="site-header-actions">
          {props.children}
          <LocaleSwitch
            target={props.locale === "es" ? "en" : "es"}
            text={props.t.locale.switchTo}
            label={props.t.locale.switchLabel}
          />
        </nav>
      </div>
    </header>
  );
}
