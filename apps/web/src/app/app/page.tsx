import type { Metadata } from "next";
import { RenewSession } from "@/components/renew-session.tsx";
import { fetchSettings } from "@/lib/api.ts";
import { format } from "@/lib/i18n.ts";
import { accessClaims } from "@/lib/session.ts";
import { webConfig } from "@/lib/server/config.ts";
import { currentDictionary, requireAppSession } from "@/lib/server/request.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await currentDictionary();
  return { title: `${t.app.title} · ${t.meta.title}` };
}

export default async function AppPage() {
  const access = await requireAppSession();
  const t = await currentDictionary();
  const username = accessClaims(access.session.accessToken)?.username ?? "";
  const settings =
    access.kind === "allow"
      ? await fetchSettings(webConfig().apiUrl, access.session.accessToken)
      : null;

  return (
    <main className="container account">
      <h1>{format(t.app.greeting, { username })}</h1>
      {settings === null ? (
        <RenewSession t={t.renew} />
      ) : (
        <>
          <section className="card account-card">
            <h2>{t.app.defaultStyle}</h2>
            {settings.kind === "ok" ? (
              <p className="account-value">
                <code data-testid="default-style">{settings.settings.defaultStyleId}</code>
              </p>
            ) : (
              <p role="alert" className="form-error">
                {t.app.settingsUnavailable}
              </p>
            )}
          </section>
          <section className="card account-card account-soon">
            <h2>{t.app.comingSoonTitle}</h2>
            <p>{t.app.comingSoon}</p>
          </section>
        </>
      )}
    </main>
  );
}
