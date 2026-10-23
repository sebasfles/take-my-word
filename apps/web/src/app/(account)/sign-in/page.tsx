import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mark, Waveform } from "@take-my-word/brand";
import { SignInForm } from "@/components/sign-in-form.tsx";
import { SiteFooter } from "@/components/site-footer.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { signInRedirect } from "@/lib/gate.ts";
import { publicPath } from "@/lib/seo.ts";
import {
  currentDictionary,
  currentLocale,
  currentSession,
  currentTheme,
} from "@/lib/server/request.ts";
import "@/styles/auth.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await currentDictionary();
  return { title: `${t.signIn.title} · ${t.meta.title}` };
}

export default async function SignInPage() {
  const target = signInRedirect(await currentSession());
  if (target !== null) redirect(target);
  const locale = await currentLocale();
  const theme = await currentTheme();
  const t = await currentDictionary();

  return (
    <>
      <SiteHeader locale={locale} theme={theme} t={t} brandHref={publicPath(locale)} />
      <main id="main" className="auth container">
        <aside className="auth-aside" aria-hidden="true">
          <Mark size={72} className="auth-mark" />
          <p className="auth-quote">{t.signIn.asideQuote}</p>
          <p className="auth-body">{t.signIn.asideBody}</p>
          <Waveform level={0.85} bars={9} className="auth-wave" />
        </aside>
        <div className="auth-card">
          <SignInForm key={locale} t={t.signIn} />
        </div>
      </main>
      <SiteFooter t={t} theme={theme} locale={locale} />
    </>
  );
}
