import { Mark } from "@take-my-word/brand";
import { dictionary, locales } from "@/lib/i18n.ts";
import { publicPath } from "@/lib/seo.ts";
import "@/styles/not-found.css";

export function NotFoundContent() {
  return (
    <main id="main" className="container not-found">
      <Mark size={56} className="not-found-mark" />
      {locales.map((locale) => {
        const t = dictionary(locale).notFound;
        return (
          <section key={locale} lang={locale} className="not-found-copy">
            {locale === "en" ? <h1>{t.title}</h1> : <h2>{t.title}</h2>}
            <p>{t.body}</p>
            <a href={publicPath(locale)} hrefLang={locale}>
              {t.home}
            </a>
          </section>
        );
      })}
    </main>
  );
}
