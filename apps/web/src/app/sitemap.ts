import type { MetadataRoute } from "next";
import { webConfig } from "@/lib/server/config.ts";
import { builtAt, sitemapFile } from "@/lib/seo.ts";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapFile(webConfig().webOrigin, builtAt(process.env.WEB_BUILT_AT));
}
