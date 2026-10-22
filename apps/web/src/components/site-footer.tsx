import Link from "next/link";
import { Wordmark } from "@take-my-word/brand";
import type { Dictionary } from "@/lib/i18n.ts";
import { releasesUrl } from "@/lib/links.ts";
import type { Theme } from "@/lib/theme.ts";
import { ThemeSwitch } from "./theme-switch.tsx";

export function SiteFooter({ t, theme }: { t: Dictionary; theme: Theme }) {
  const links = [
    { href: "/#how", text: t.nav.howItWorks },
    { href: "/#privacy", text: t.nav.privacy },
    { href: "/#download", text: t.nav.download },
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
          <a href={releasesUrl}>{t.landing.footer.releases}</a>
        </nav>
        <ThemeSwitch initial={theme} t={t.theme} />
      </div>
    </footer>
  );
}
