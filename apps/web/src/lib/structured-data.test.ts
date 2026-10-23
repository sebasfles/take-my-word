import { describe, expect, it } from "vitest";
import { dictionary, locales } from "./i18n.ts";
import { releaseLinks } from "./links.ts";
import { jsonLd, structuredData } from "./structured-data.ts";

const origin = "https://dictation.example.com";
const links = releaseLinks("someone/take-my-word");

function graph(version: string | null, locale: (typeof locales)[number] = "en") {
  const data = structuredData({ locale, t: dictionary(locale), origin, version, links });
  return Object.fromEntries(data["@graph"].map((node) => [node["@type"], node])) as Record<
    string,
    Record<string, unknown>
  >;
}

describe("structuredData", () => {
  it("describes a free Windows app with its installer and latest version", () => {
    const app = graph("0.3.0").SoftwareApplication;
    expect(app).toMatchObject({
      operatingSystem: "Windows 10, Windows 11",
      downloadUrl: links.windowsInstaller,
      softwareVersion: "0.3.0",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: `${origin}/en`,
    });
  });

  it("leaves the version out while the release cannot be read", () => {
    expect(graph(null).SoftwareApplication).not.toHaveProperty("softwareVersion");
  });

  it.each(locales)("answers in FAQPage exactly the questions the %s page shows", (locale) => {
    const faq = graph(null, locale).FAQPage;
    expect(faq?.mainEntity).toEqual(
      dictionary(locale).landing.faq.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    );
  });

  it("names the same author for the site and the app", () => {
    const nodes = graph(null);
    expect(nodes.WebSite?.author).toEqual({ "@id": nodes.Person?.["@id"] });
    expect(nodes.SoftwareApplication?.author).toEqual({ "@id": nodes.Person?.["@id"] });
  });
});

describe("jsonLd", () => {
  it("cannot close the script element it is written into", () => {
    const text = jsonLd({ name: "</script><script>alert(1)</script>" });
    expect(text).not.toContain("<");
    expect(JSON.parse(text)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
