import { AccountSection, EmptyState } from "@/components/account-section.tsx";
import { bothLoaded, isBuiltinStyle } from "@/lib/account.ts";
import { loadAccount } from "@/lib/server/account.ts";
import { sectionMetadata } from "@/lib/server/metadata.ts";
import { currentDictionary } from "@/lib/server/request.ts";

export const generateMetadata = () => sectionMetadata((t) => t.styles.title);

export default async function StylesPage() {
  const t = await currentDictionary();
  const data = await loadAccount(async (api) =>
    bothLoaded(await Promise.all([api.styles(), api.settings()])),
  );

  return (
    <AccountSection t={t} title={t.styles.title} intro={t.styles.intro} data={data}>
      {([styles, settings]) => {
        const custom = styles.filter((style) => !style.builtin);
        const defaultBadge = (id: string) =>
          id === settings.defaultStyleId && (
            <span className="badge badge-accent">{t.styles.isDefault}</span>
          );
        return (
          <>
            <section className="subsection" aria-labelledby="builtin-styles">
              <h2 id="builtin-styles">{t.styles.builtinTitle}</h2>
              <ul className="card list">
                {styles
                  .filter((style) => style.builtin)
                  .map((style) => style.id)
                  .filter(isBuiltinStyle)
                  .map((id) => (
                    <li key={id} className="list-row style" data-testid="builtin-style">
                      <div className="style-heading">
                        <h3>{t.styles.names[id]}</h3>
                        <span className="badge">{t.styles.builtin}</span>
                        {defaultBadge(id)}
                      </div>
                      <p className="style-prompt">{t.styles.descriptions[id]}</p>
                    </li>
                  ))}
              </ul>
            </section>
            <section className="subsection" aria-labelledby="custom-styles">
              <h2 id="custom-styles">{t.styles.customTitle}</h2>
              {custom.length === 0 ? (
                <EmptyState text={t.styles.empty} />
              ) : (
                <ul className="card list">
                  {custom.map((style) => (
                    <li key={style.id} className="list-row style" data-testid="custom-style">
                      <div className="style-heading">
                        <h3>{style.name}</h3>
                        {defaultBadge(style.id)}
                      </div>
                      <p className="style-prompt">{style.prompt}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        );
      }}
    </AccountSection>
  );
}
