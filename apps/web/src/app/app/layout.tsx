import type { ReactNode } from "react";
import { AccountNav } from "@/components/account-nav.tsx";
import { SignOutButton } from "@/components/sign-out-button.tsx";
import { SiteFooter } from "@/components/site-footer.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { StateStringsProvider } from "@/components/state-strings.tsx";
import {
  currentDictionary,
  currentLocale,
  currentTheme,
  currentUsername,
  requireAppSession,
} from "@/lib/server/request.ts";
import "../../styles/account.css";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireAppSession();
  const username = await currentUsername();
  const locale = await currentLocale();
  const theme = await currentTheme();
  const t = await currentDictionary();
  const links = [
    { href: "/app", text: t.sections.account, icon: "account" },
    { href: "/app/dictionary", text: t.sections.dictionary, icon: "dictionary" },
    { href: "/app/styles", text: t.sections.styles, icon: "styles" },
    { href: "/app/rules", text: t.sections.rules, icon: "rules" },
    { href: "/app/history", text: t.sections.history, icon: "history" },
  ] as const;

  return (
    <>
      <SiteHeader locale={locale} theme={theme} t={t} brandHref="/app">
        <p className="identity">
          <span className="identity-label">{t.app.signedInAs}</span>{" "}
          <strong data-testid="username">{username}</strong>
        </p>
        <SignOutButton text={t.app.signOut} />
      </SiteHeader>
      <div className="container shell">
        <AccountNav label={t.sections.label} links={links} />
        <main id="main" className="shell-main">
          <StateStringsProvider value={t.state}>{children}</StateStringsProvider>
        </main>
      </div>
      <SiteFooter t={t} theme={theme} />
    </>
  );
}
