import { AccountSection, EmptyState } from "@/components/account-section.tsx";
import { bothLoaded, keystrokeKeys, styleLabel } from "@/lib/account.ts";
import { loadAccount } from "@/lib/server/account.ts";
import { sectionMetadata } from "@/lib/server/metadata.ts";
import { currentDictionary, currentLocale } from "@/lib/server/request.ts";

export const generateMetadata = () => sectionMetadata((t) => t.rules.title);

export default async function RulesPage() {
  const t = await currentDictionary();
  const locale = await currentLocale();
  const data = await loadAccount(async (api) =>
    bothLoaded(await Promise.all([api.appRules(), api.styles()])),
  );

  return (
    <AccountSection t={t} title={t.rules.title} intro={t.rules.intro} data={data}>
      {([rules, styles]) =>
        rules.length === 0 ? (
          <EmptyState title={t.rules.emptyTitle} text={t.rules.empty} />
        ) : (
          <table className="card table" data-testid="rules">
            <thead>
              <tr>
                <th scope="col">{t.rules.app}</th>
                <th scope="col">{t.rules.style}</th>
                <th scope="col">{t.rules.keystroke}</th>
              </tr>
            </thead>
            <tbody>
              {[...rules]
                .sort((a, b) => a.appId.localeCompare(b.appId, locale))
                .map((rule) => {
                  const style = styleLabel(rule.styleId, styles, t.styles);
                  return (
                    <tr key={rule.id} data-testid="rule">
                      <th scope="row" data-label={t.rules.app}>
                        <code>{rule.appId}</code>
                      </th>
                      <td
                        data-label={t.rules.style}
                        className={style.fallback ? "muted" : undefined}
                      >
                        {style.name}
                      </td>
                      <td data-label={t.rules.keystroke}>
                        <span className="keys">
                          {keystrokeKeys[rule.keystroke].map((key) => (
                            <kbd key={key}>{key}</kbd>
                          ))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )
      }
    </AccountSection>
  );
}
