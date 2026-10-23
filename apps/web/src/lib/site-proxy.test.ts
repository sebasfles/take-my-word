import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { siteProxy } from "./site-proxy.ts";

const official = "https://dictation.example.com";

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, "http://internal.lambda-url.example"), { headers });
}

describe("siteProxy at /", () => {
  const proxy = siteProxy({ webOrigin: () => official, indexedOrigin: official });

  it.each([
    [{}, "/en"],
    [{ "accept-language": "es-MX,es;q=0.9,en;q=0.8" }, "/es"],
    [{ "accept-language": "fr-FR,fr;q=0.9" }, "/en"],
    [{ cookie: "tmw-lang=en", "accept-language": "es-MX,es;q=0.9" }, "/en"],
    [{ cookie: "tmw-lang=es" }, "/es"],
    [{ cookie: "tmw-lang=fr", "accept-language": "es" }, "/es"],
  ])("redirects %j to %s with a 307 on the web origin", (headers, target) => {
    const response = proxy(request("/", headers));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${official}${target}`);
    expect(response.headers.get("vary")).toBe("Cookie, Accept-Language");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("keeps the query string", () => {
    const response = proxy(request("/?utm_source=readme"));
    expect(response.headers.get("location")).toBe(`${official}/en?utm_source=readme`);
  });
});

describe("siteProxy X-Robots-Tag", () => {
  it("lets the official deployment's public pages be indexed and nothing else", () => {
    const proxy = siteProxy({ webOrigin: () => official, indexedOrigin: official });
    expect(proxy(request("/en")).headers.get("x-robots-tag")).toBeNull();
    expect(proxy(request("/es")).headers.get("x-robots-tag")).toBeNull();
    expect(proxy(request("/sign-in")).headers.get("x-robots-tag")).toBe("noindex");
    expect(proxy(request("/app/history")).headers.get("x-robots-tag")).toBe("noindex");
  });

  it.each([
    ["dev", `https://dev.dictation.example.com`, official],
    ["a self-hosted copy of the official build", "https://copy.example.org", official],
    ["a self-hosted build", "https://copy.example.org", null],
  ])("keeps %s out of search results", (_, webOrigin, indexedOrigin) => {
    const proxy = siteProxy({ webOrigin: () => webOrigin, indexedOrigin });
    for (const path of ["/en", "/es", "/sign-in"]) {
      const response = proxy(request(path));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-robots-tag")).toBe("noindex");
    }
  });
});
