import type { Dictionary } from "@/lib/i18n.ts";

export function Faq({ t }: { t: Dictionary["landing"]["faq"] }) {
  return (
    <section id="faq" className="section" aria-labelledby="faq-title">
      <div className="container split faq-split">
        <header className="section-head">
          <p className="kicker">{t.kicker}</p>
          <h2 id="faq-title">{t.title}</h2>
        </header>
        <dl className="faq">
          {t.items.map((item) => (
            <div key={item.question} className="faq-item">
              <dt>{item.question}</dt>
              <dd>{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
