import type { Dictionary, Locale } from "@/lib/i18n.ts";
import { links } from "@/lib/links.ts";
import { webConfig } from "@/lib/server/config.ts";
import { latestDesktopVersion } from "@/lib/server/release.ts";
import { jsonLd, structuredData } from "@/lib/structured-data.ts";

export async function StructuredData({ locale, t }: { locale: Locale; t: Dictionary }) {
  const data = structuredData({
    locale,
    t,
    origin: webConfig().webOrigin,
    version: await latestDesktopVersion(),
    links,
  });
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
