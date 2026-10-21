import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { signInRedirect } from "@/lib/gate.ts";
import { currentDictionary, currentLocale, currentSession } from "@/lib/server/request.ts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await currentDictionary();
  return { title: `${t.signIn.title} · ${t.meta.title}` };
}

export default async function SignInPage() {
  const target = signInRedirect(await currentSession());
  if (target !== null) redirect(target);
  const locale = await currentLocale();
  const t = await currentDictionary();

  return (
    <>
      <SiteHeader locale={locale} t={t} brandHref="/" />
      <main className="auth container">
        <div className="card auth-card">
          <SignInForm key={locale} t={t.signIn} />
        </div>
      </main>
    </>
  );
}
