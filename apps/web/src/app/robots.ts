import type { MetadataRoute } from "next";
import { webConfig } from "@/lib/server/config.ts";
import { robotsFile } from "@/lib/seo.ts";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return robotsFile(webConfig().webOrigin);
}
