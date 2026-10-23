import { NextResponse, type NextRequest } from "next/server";
import { isLocale, localeCookieName, localeFrom } from "./locale.ts";
import { preferenceCookie } from "./preference.ts";
import { isIndexed, languageParameter, publicPath, robotsTag } from "./seo.ts";

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
    } else if (pathname === "/sign-in" && request.nextUrl.searchParams.has(languageParameter)) {
      const lang = request.nextUrl.searchParams.get(languageParameter);
      const target = new URL(request.nextUrl.pathname, webOrigin);
      for (const [name, value] of request.nextUrl.searchParams) {
        if (name !== languageParameter) target.searchParams.append(name, value);
      }
      response = NextResponse.redirect(target, 307);
      response.headers.set("cache-control", "private, no-store");
      if (isLocale(lang)) {
        const cookie = preferenceCookie(localeCookieName, lang);
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }
    } else {
      response = NextResponse.next();
    }
    const tag = robotsTag(pathname, isIndexed(webOrigin, options.indexedOrigin));
    if (tag !== null) response.headers.set("x-robots-tag", tag);
    return response;
  };
}
