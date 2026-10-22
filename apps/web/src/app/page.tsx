import Link from "next/link";
import { buttonClass, Mark, Waveform } from "@take-my-word/brand";
import { Demo, StaticExample } from "@/components/landing/demo.tsx";
import { Download } from "@/components/landing/download.tsx";
import { SiteFooter } from "@/components/site-footer.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { demoScripts } from "@/lib/i18n.ts";
import { currentDictionary, currentLocale, currentTheme } from "@/lib/server/request.ts";
import "../styles/landing.css";

export default async function LandingPage() {
  const locale = await currentLocale();
  const theme = await currentTheme();
  const t = await currentDictionary();
  const l = t.landing;
  const scripts = demoScripts(locale);

  return (
    <>
      <SiteHeader
        locale={locale}
        theme={theme}
        t={t}
        brandHref="/"
        nav={
          <nav className="site-nav" aria-label={t.nav.label}>
            <a href="#how">{t.nav.howItWorks}</a>
            <a href="#privacy">{t.nav.privacy}</a>
            <a href="#download">{t.nav.download}</a>
          </nav>
        }
      >
        <Link href="/sign-in" className={buttonClass({ variant: "ghost", size: "sm" })}>
          {t.nav.signIn}
        </Link>
      </SiteHeader>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="container hero-inner">
            <div className="hero-copy">
              <p className="kicker">{l.kicker}</p>
              <h1 id="hero-title" className="hero-title">
                {l.headline[0]} <em>{l.headline[1]}</em>
              </h1>
              <p className="hero-pitch">{l.pitch}</p>
              <Download t={l} />
            </div>
            <div className="hero-stage">
              <Demo script={scripts.primary} t={l.demo} />
              <p className="hero-tagline">{l.tagline}</p>
            </div>
          </div>
        </section>

        <section id="how" className="section" aria-labelledby="how-title">
          <div className="container">
            <header className="section-head">
              <h2 id="how-title">{l.stepsTitle}</h2>
              <p>{l.stepsIntro}</p>
            </header>
            <ol className="steps">
              {l.steps.map((step, index) => (
                <li key={step.title} className="step">
                  <span className="step-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="bilingual">
              <div className="bilingual-copy">
                <h3>{l.multilingual.title}</h3>
                <p>{l.multilingual.body}</p>
              </div>
              <StaticExample script={scripts.other} t={l.demo} label={l.multilingual.label} />
            </div>
          </div>
        </section>

        <section id="dictionary" className="band" aria-labelledby="dictionary-title">
          <div className="container band-inner">
            <div className="band-copy">
              <p className="kicker kicker-on-accent">{l.dictionary.kicker}</p>
              <h2 id="dictionary-title">{l.dictionary.title}</h2>
              <p>{l.dictionary.body}</p>
            </div>
            <table className="lexicon">
              <thead>
                <tr>
                  <th scope="col">{l.dictionary.heard}</th>
                  <th scope="col">
                    <span className="visually-hidden">→</span>
                  </th>
                  <th scope="col">{l.dictionary.written}</th>
                </tr>
              </thead>
              <tbody>
                {l.dictionary.examples.map((example) => (
                  <tr key={example.written}>
                    <td className="lexicon-heard">{example.heard}</td>
                    <td className="lexicon-arrow" aria-hidden="true">
                      <Waveform level={0.7} bars={4} />
                    </td>
                    <td className="lexicon-written">{example.written}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="styles" className="section" aria-labelledby="styles-title">
          <div className="container split">
            <header className="section-head">
              <p className="kicker">{l.styles.kicker}</p>
              <h2 id="styles-title">{l.styles.title}</h2>
              <p>{l.styles.body}</p>
            </header>
            <figure className="styles-demo">
              <p className="styles-spoken">
                <Mark size={20} className="styles-spoken-mark" />
                <span>{l.styles.spoken}</span>
              </p>
              <ul className="styles-list">
                {l.styles.examples.map((example) => (
                  <li key={example.name} className="styles-item">
                    <span className="styles-name">{example.name}</span>
                    <p>{example.text}</p>
                  </li>
                ))}
              </ul>
            </figure>
          </div>
        </section>

        <section id="rules" className="section section-tinted" aria-labelledby="rules-title">
          <div className="container split split-reverse">
            <header className="section-head">
              <p className="kicker">{l.rules.kicker}</p>
              <h2 id="rules-title">{l.rules.title}</h2>
              <p>{l.rules.body}</p>
            </header>
            <table className="rules-table">
              <thead>
                <tr>
                  <th scope="col">{l.rules.app}</th>
                  <th scope="col">{l.rules.style}</th>
                  <th scope="col">{l.rules.paste}</th>
                </tr>
              </thead>
              <tbody>
                {l.rules.rows.map((row) => (
                  <tr key={row.app}>
                    <th scope="row">{row.app}</th>
                    <td>{row.style}</td>
                    <td>
                      <span className="keys">
                        {row.keys.map((key) => (
                          <kbd key={key}>{key}</kbd>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="privacy" className="section" aria-labelledby="privacy-title">
          <div className="container">
            <header className="section-head">
              <p className="kicker">{l.privacy.kicker}</p>
              <h2 id="privacy-title">{l.privacy.title}</h2>
            </header>
            <ul className="privacy">
              {l.privacy.points.map((point) => (
                <li key={point.title} className="privacy-point">
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="download" className="section" aria-labelledby="download-title">
          <div className="container get">
            <Mark size={56} className="get-mark" />
            <h2 id="download-title">{l.get.title}</h2>
            <p>{l.get.body}</p>
            <Download t={l} align="center" />
            <p className="get-account">
              {l.haveAccount} <Link href="/sign-in">{t.nav.signIn}</Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter t={t} theme={theme} />
    </>
  );
}
