import Link from "next/link";
import { SiteHeader } from "@/components/site-header.tsx";
import { windowsDownloadUrl } from "@/lib/links.ts";
import { currentDictionary, currentLocale } from "@/lib/server/request.ts";

export default async function LandingPage() {
  const locale = await currentLocale();
  const t = await currentDictionary();

  return (
    <>
      <SiteHeader locale={locale} t={t} brandHref="/">
        <Link href="/sign-in" className="button button-ghost">
          {t.nav.signIn}
        </Link>
      </SiteHeader>
      <main>
        <section className="hero container">
          <h1>Take My Word</h1>
          <p className="hero-tagline">{t.landing.tagline}</p>
          <p className="hero-pitch">{t.landing.pitch}</p>
          <div className="hero-actions">
            <a className="button button-primary button-large" href={windowsDownloadUrl}>
              <svg className="button-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M0 2.3 6.5 1.4v6.2H0zm7.3-1L16 0v7.6H7.3zM0 8.4h6.5v6.2L0 13.7zm7.3 0H16V16l-8.7-1.2z" />
              </svg>
              {t.landing.download}
            </a>
            <p className="hero-note">{t.landing.downloadNote}</p>
          </div>
        </section>

        <section className="section container" aria-labelledby="steps-title">
          <h2 id="steps-title">{t.landing.stepsTitle}</h2>
          <ol className="steps">
            {t.landing.steps.map((step, index) => (
              <li key={step.title} className="card step">
                <span className="step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section container" aria-labelledby="features-title">
          <h2 id="features-title">{t.landing.featuresTitle}</h2>
          <ul className="features">
            {t.landing.features.map((feature) => (
              <li key={feature}>
                <svg className="feature-check" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M6.2 11.6 2.8 8.2l1.1-1.1 2.3 2.3 5.9-5.9 1.1 1.1z" />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container site-footer-inner">
          <p>{t.landing.invite}</p>
          <p>
            {t.landing.haveAccount} <Link href="/sign-in">{t.nav.signIn}</Link>
          </p>
        </div>
      </footer>
    </>
  );
}
