import { AccountSection, EmptyState } from "@/components/account-section.tsx";
import { DeletableDictation } from "@/components/deletable-dictation.tsx";
import { LoadMore } from "@/components/load-more.tsx";
import { LocalTime } from "@/components/local-time.tsx";
import {
  bothLoaded,
  formatSeconds,
  historyView,
  nextHistoryHref,
  styleLabel,
} from "@/lib/account.ts";
import { loadAccount } from "@/lib/server/account.ts";
import { sectionMetadata } from "@/lib/server/metadata.ts";
import { currentDictionary, currentLocale } from "@/lib/server/request.ts";

export const generateMetadata = () => sectionMetadata((t) => t.history.title);

export default async function HistoryPage(props: {
  searchParams: Promise<{ limit?: string | string[]; pages?: string | string[] }>;
}) {
  const t = await currentDictionary();
  const locale = await currentLocale();
  const view = historyView(await props.searchParams);
  const data = await loadAccount(async (api) =>
    bothLoaded(await Promise.all([api.history(view.shown), api.styles()])),
  );
  const next = nextHistoryHref(view);

  return (
    <AccountSection t={t} title={t.history.title} intro={t.history.intro} data={data}>
      {([history, styles]) =>
        history.items.length === 0 ? (
          <EmptyState title={t.history.emptyTitle} text={t.history.empty} />
        ) : (
          <>
            <ol className="dictations" data-testid="dictations">
              {history.items.map((item) => (
                <DeletableDictation
                  key={item.id}
                  id={item.id}
                  t={t.history}
                  meta={
                    <dl className="dictation-meta">
                      <div>
                        <dt className="visually-hidden">{t.history.date}</dt>
                        <dd>
                          <LocalTime value={item.createdAt} locale={locale} withTime />
                        </dd>
                      </div>
                      {item.styleId !== undefined && (
                        <div>
                          <dt>{t.history.style}</dt>
                          <dd>{styleLabel(item.styleId, styles, t.styles).name}</dd>
                        </div>
                      )}
                      <div>
                        <dt>{t.history.audio}</dt>
                        <dd>{formatSeconds(item.audioSeconds, locale)}</dd>
                      </div>
                    </dl>
                  }
                >
                  <p className={item.text === "" ? "dictation-text muted" : "dictation-text"}>
                    {item.text === "" ? t.history.noText : item.text}
                  </p>
                  {item.raw !== "" && (
                    <details className="dictation-raw">
                      <summary>{t.history.raw}</summary>
                      <p>{item.raw}</p>
                    </details>
                  )}
                </DeletableDictation>
              ))}
            </ol>
            {history.more && next !== null && (
              <LoadMore href={next} text={t.history.loadMore} pendingText={t.history.loadingMore} />
            )}
          </>
        )
      }
    </AccountSection>
  );
}
