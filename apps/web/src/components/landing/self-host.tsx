import { Badge, buttonClass } from "@take-my-word/brand";
import { format, type Dictionary, type Locale } from "@/lib/i18n.ts";
import { links } from "@/lib/links.ts";
import { checkedOnText, inlineCode, pricesCheckedOn } from "@/lib/self-host.ts";

function WithCode({ text }: { text: string }) {
  return inlineCode(text).map((part, index) =>
    part.code ? <code key={index}>{part.text}</code> : part.text,
  );
}

export function SelfHost({ locale, t }: { locale: Locale; t: Dictionary["landing"]["selfHost"] }) {
  const cost = t.cost;
  return (
    <section id="self-host" className="section section-tinted" aria-labelledby="self-host-title">
      <div className="container">
        <header className="section-head">
          <p className="kicker">{t.kicker}</p>
          <h2 id="self-host-title">{t.title}</h2>
          <p>{t.body}</p>
        </header>
        <div className="self-host">
          <div className="self-host-path">
            <ol className="self-host-steps" aria-label={t.stepsLabel}>
              {t.steps.map((step, index) => (
                <li key={step.title} className="self-host-step">
                  <span className="step-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="self-host-step-body">
                    <h3>
                      {step.title}
                      {step.recommended === true && <Badge tone="accent">{t.recommended}</Badge>}
                    </h3>
                    <p>
                      <WithCode text={step.body} />
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="self-host-actions">
              <a className={buttonClass({ variant: "secondary" })} href={links.selfHostGuide}>
                {t.guide}
              </a>
              <a href={links.license}>{t.license}</a>
            </p>
          </div>
          <div className="cost">
            <h3 id="cost-title">{cost.title}</h3>
            <dl className="cost-list" aria-labelledby="cost-title">
              {cost.rows.map((row) => (
                <div key={row.item} className="cost-row">
                  <dt>{row.item}</dt>
                  <dd className="cost-price">{row.price}</dd>
                  <dd className="cost-note">
                    {row.note}
                    <span className="cost-links">
                      {row.links.map((link, index) => (
                        <span key={link.href}>
                          {index > 0 && " · "}
                          <a href={link.href}>{link.text}</a>
                        </span>
                      ))}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="cost-example">{cost.example}</p>
            <p className="cost-fine">
              {cost.free} <a href={cost.freeLink.href}>{cost.freeLink.text}</a>. {cost.domain}
            </p>
            <p className="cost-fine">
              <time dateTime={pricesCheckedOn}>
                {format(cost.checked, { date: checkedOnText(locale) })}
              </time>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
