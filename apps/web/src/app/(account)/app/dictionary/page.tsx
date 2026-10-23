import Link from "next/link";
import { AccountSection, EmptyState } from "@/components/account-section.tsx";
import { LocalTime } from "@/components/local-time.tsx";
import { sortTerms, termSort } from "@/lib/account.ts";
import { loadAccount } from "@/lib/server/account.ts";
import { sectionMetadata } from "@/lib/server/metadata.ts";
import { currentDictionary, currentLocale } from "@/lib/server/request.ts";

export const generateMetadata = () => sectionMetadata((t) => t.dictionary.title);

export default async function DictionaryPage(props: {
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const t = await currentDictionary();
  const locale = await currentLocale();
  const sort = termSort((await props.searchParams).sort);
  const data = await loadAccount((api) => api.dictionary());
  const number = new Intl.NumberFormat(locale);
  const sorts = [
    { value: "relevance", href: "/app/dictionary", text: t.dictionary.byRelevance },
    { value: "name", href: "/app/dictionary?sort=name", text: t.dictionary.byName },
  ] as const;

  return (
    <AccountSection t={t} title={t.dictionary.title} intro={t.dictionary.intro} data={data}>
      {(terms) =>
        terms.length === 0 ? (
          <EmptyState title={t.dictionary.emptyTitle} text={t.dictionary.empty} />
        ) : (
          <>
            <nav className="segmented" aria-label={t.dictionary.sortLabel}>
              <span className="segmented-label">{t.dictionary.sortLabel}</span>
              {sorts.map((option) => (
                <Link
                  key={option.value}
                  href={option.href}
                  aria-current={sort === option.value ? "true" : undefined}
                  replace
                  scroll={false}
                >
                  {option.text}
                </Link>
              ))}
            </nav>
            <ul className="card list" data-testid="terms">
              {sortTerms(terms, sort, new Date(), locale).map((term) => (
                <li key={term.id} className="list-row term" data-testid="term">
                  <div className="term-main">
                    <p className="term-name">{term.term}</p>
                    {term.aliases.length > 0 && (
                      <p className="term-aliases">
                        <span className="visually-hidden">{t.dictionary.aliases}: </span>
                        {term.aliases.map((alias) => (
                          <span key={alias} className="chip">
                            {alias}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <dl className="term-stats">
                    <div>
                      <dt>{t.dictionary.uses}</dt>
                      <dd>{number.format(term.useCount)}</dd>
                    </div>
                    <div>
                      <dt>{t.dictionary.lastUsed}</dt>
                      <dd>
                        <LocalTime value={term.lastUsedAt} locale={locale} />
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )
      }
    </AccountSection>
  );
}
