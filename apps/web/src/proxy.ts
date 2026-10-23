import { indexedOrigin } from "@/lib/seo.ts";
import { siteProxy } from "@/lib/site-proxy.ts";

const buildIndexedOrigin = indexedOrigin(process.env.WEB_INDEXED_ORIGIN);

export const proxy = siteProxy({
  webOrigin: () => {
    const origin = process.env.WEB_ORIGIN;
    if (!origin) throw new Error("WEB_ORIGIN is not set");
    return origin;
  },
  indexedOrigin: buildIndexedOrigin,
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|static/).*)"],
};
