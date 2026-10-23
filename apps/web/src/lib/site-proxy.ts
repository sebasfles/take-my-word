import { NextResponse, type NextRequest } from "next/server";
import { localeCookieName, localeFrom } from "./locale.ts";
import { isIndexed, publicPath, robotsTag } from "./seo.ts";

export function siteProxy(options: { webOrigin: () => string; indexedOrigin: string | null }) {
  return function proxy(request: NextRequest): NextResponse {
    const webOrigin = options.webOrigin();
    const { pathname, search } = request.nextUrl;
    let response: NextResponse;
    if (pathname === "/") {
      const locale = localeFrom(
        request.cookies.get(localeCookieName)?.value,
        request.headers.get("accept-language"),
      );
      response = NextResponse.redirect(new URL(`${publicPath(locale)}${search}`, webOrigin), 307);
      response.headers.set("vary", "Cookie, Accept-Language");
      response.headers.set("cache-control", "private, no-store");
    } else {
      response = NextResponse.next();
    }
    const tag = robotsTag(pathname, isIndexed(webOrigin, options.indexedOrigin));
    if (tag !== null) response.headers.set("x-robots-tag", tag);
    return response;
  };
}
