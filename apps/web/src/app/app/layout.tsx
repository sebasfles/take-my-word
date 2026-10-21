import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { accessClaims } from "@/lib/session.ts";
import { currentDictionary, currentLocale, requireAppSession } from "@/lib/server/request.ts";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { session } = await requireAppSession();
  const username = accessClaims(session.accessToken)?.username ?? "";
  const locale = await currentLocale();
  const t = await currentDictionary();

  return (
    <>
      <SiteHeader locale={locale} t={t} brandHref="/app" compactBrand>
        <p className="identity">
          <span className="identity-label">{t.app.signedInAs}</span>{" "}
          <strong data-testid="username">{username}</strong>
        </p>
        <SignOutButton text={t.app.signOut} />
      </SiteHeader>
      {children}
    </>
  );
}
