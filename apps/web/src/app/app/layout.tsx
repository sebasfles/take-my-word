import type { ReactNode } from "react";
import { AccountNav } from "@/components/account-nav.tsx";
import { SignOutButton } from "@/components/sign-out-button.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { StateStringsProvider } from "@/components/state-strings.tsx";
import {
  currentDictionary,
  currentLocale,
  currentUsername,
  requireAppSession,
} from "@/lib/server/request.ts";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireAppSession();
  const username = await currentUsername();
  const locale = await currentLocale();
  const t = await currentDictionary();
  const links = [
    { href: "/app", text: t.sections.account },
    { href: "/app/dictionary", text: t.sections.dictionary },
    { href: "/app/styles", text: t.sections.styles },
    { href: "/app/rules", text: t.sections.rules },
    { href: "/app/history", text: t.sections.history },
  ];

  return (
    <>
      <SiteHeader locale={locale} t={t} brandHref="/app" compactBrand>
        <p className="identity">
          <span className="identity-label">{t.app.signedInAs}</span>{" "}
          <strong data-testid="username">{username}</strong>
        </p>
        <SignOutButton text={t.app.signOut} />
      </SiteHeader>
      <div className="container shell">
        <AccountNav label={t.sections.label} links={links} />
        <main className="shell-main">
          <StateStringsProvider value={t.state}>{children}</StateStringsProvider>
        </main>
      </div>
    </>
  );
}
