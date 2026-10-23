import Link from "next/link";
import { Wordmark } from "@take-my-word/brand";
import type { Dictionary, Locale } from "@/lib/i18n.ts";
import { links as releaseLinks } from "@/lib/links.ts";
import { publicPath } from "@/lib/seo.ts";
import type { Theme } from "@/lib/theme.ts";
import { ThemeSwitch } from "./theme-switch.tsx";

export function SiteFooter({ t, theme, locale }: { t: Dictionary; theme: Theme; locale: Locale }) {
  const home = publicPath(locale);
  const links = [
    { href: `${home}#how`, text: t.nav.howItWorks },
    { href: `${home}#privacy`, text: t.nav.privacy },
    { href: `${home}#self-host`, text: t.nav.selfHost },
    { href: `${home}#download`, text: t.nav.download },
    { href: "/sign-in", text: t.nav.signIn },
  ];
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <div className="site-footer-brand">
          <Wordmark height={24} title={t.meta.title} />
          <p className="site-footer-tagline">{t.landing.tagline}</p>
        </div>
        <nav aria-label={t.nav.label} className="site-footer-nav">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.text}
            </Link>
          ))}
          <a href={releaseLinks.releases}>{t.landing.footer.releases}</a>
          <a href={releaseLinks.repository}>{t.landing.footer.source}</a>
        </nav>
        <ThemeSwitch initial={theme} t={t.theme} />
      </div>
    </footer>
  );
}
