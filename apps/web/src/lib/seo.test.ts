import { describe, expect, it } from "vitest";
import { builtAt, indexedOrigin, isIndexed, robotsFile, robotsTag, sitemapFile } from "./seo.ts";

describe("indexedOrigin", () => {
  it.each([undefined, ""])("leaves a build without %j unindexed", (value) => {
    expect(indexedOrigin(value)).toBeNull();
  });

  it.each(["https://dictation.example.com", "http://localhost:4511", "http://127.0.0.1:3000"])(
    "accepts %s",
    (value) => {
      expect(indexedOrigin(value)).toBe(value);
    },
  );

  it.each([
    "dictation.example.com",
    "https://dictation.example.com/",
    "https://dictation.example.com/en",
    "http://dictation.example.com",
    "HTTPS://Dictation.example.com",
    "javascript:alert(1)",
  ])("fails the build for %s", (value) => {
    expect(() => indexedOrigin(value)).toThrow(/WEB_INDEXED_ORIGIN/);
  });
});

describe("indexing", () => {
  const official = "https://dictation.example.com";

  it("indexes only the origin the build names", () => {
    expect(isIndexed(official, official)).toBe(true);
    expect(isIndexed("https://dev.dictation.example.com", official)).toBe(false);
    expect(isIndexed("https://copy.example.org", official)).toBe(false);
    expect(isIndexed(official, null)).toBe(false);
  });

  it.each([
    ["/en", true, null],
    ["/es", true, null],
    ["/", true, null],
    ["/", false, "noindex"],
    ["/sign-in", true, "noindex"],
    ["/app", true, "noindex"],
    ["/app/history", true, "noindex"],
    ["/gallery", true, "noindex"],
    ["/en/", true, "noindex"],
    ["/en", false, "noindex"],
    ["/es", false, "noindex"],
  ] as const)("answers %s on an indexed=%s deployment with %j", (path, indexed, tag) => {
    expect(robotsTag(path, indexed)).toBe(tag);
  });
});

describe("robots and sitemap", () => {
  const origin = "https://dictation.example.com";

  it("lets crawlers in, keeps them off the API and links the sitemap", () => {
    expect(robotsFile(origin)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://dictation.example.com/sitemap.xml",
    });
  });

  it("lists only the public pages, each with its language alternates", () => {
    const entries = sitemapFile(origin, "2026-10-23T10:00:00.000Z");
    expect(entries.map((entry) => entry.url)).toEqual([`${origin}/en`, `${origin}/es`]);
    for (const entry of entries) {
      expect(entry.lastModified).toBe("2026-10-23T10:00:00.000Z");
      expect(entry.alternates?.languages).toEqual({
        en: `${origin}/en`,
        es: `${origin}/es`,
        "x-default": `${origin}/`,
      });
    }
  });

  it("refuses a build without its timestamp", () => {
    expect(builtAt("2026-10-23T10:00:00.000Z")).toBe("2026-10-23T10:00:00.000Z");
    expect(() => builtAt(undefined)).toThrow(/WEB_BUILT_AT/);
    expect(() => builtAt("yesterday")).toThrow(/WEB_BUILT_AT/);
  });
});
