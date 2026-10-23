import type { ReactNode } from "react";
import { displayFace, textFace } from "@/app/fonts.ts";
import type { Dictionary, Locale } from "@/lib/i18n.ts";
import { themeAttribute, type Theme } from "@/lib/theme.ts";
import "@take-my-word/brand/web.css";
import "@/styles/base.css";
import "@/styles/site.css";

export function SiteDocument(props: {
  locale: Locale;
  theme: Theme;
  t: Dictionary;
  children: ReactNode;
}) {
  return (
    <html
      lang={props.locale}
      data-theme={themeAttribute(props.theme)}
      className={`${displayFace.variable} ${textFace.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          {props.t.skip}
        </a>
        {props.children}
      </body>
    </html>
  );
}
