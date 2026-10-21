import { describe, expect, it } from "vitest";
import { fetchSettings } from "./api.ts";

const settings = {
  defaultStyleId: "formal",
  locale: "es",
  providers: { transcriber: "groq-whisper", refiner: "openai" },
};

function fakeFetch(response: Response) {
  const seen: { url: string; authorization: string | null }[] = [];
  const fetcher: typeof fetch = (input, init) => {
    seen.push({
      url: input instanceof URL ? input.href : JSON.stringify(input),
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return Promise.resolve(response);
  };
  return { fetcher, seen };
}

describe("fetchSettings", () => {
  it("calls GET /me/settings with the access token and parses the shared contract", async () => {
    const { fetcher, seen } = fakeFetch(Response.json(settings));
    const result = await fetchSettings("https://api.dev.takemyword.fless.dev", "token", fetcher);
    expect(result).toEqual({ kind: "ok", settings });
    expect(seen).toEqual([
      { url: "https://api.dev.takemyword.fless.dev/me/settings", authorization: "Bearer token" },
    ]);
  });

  it("fails on an error status or a body outside the contract", async () => {
    for (const response of [
      Response.json({ error: { code: "unauthorized", message: "" } }, { status: 401 }),
      Response.json({ defaultStyleId: 3 }),
    ]) {
      const { fetcher } = fakeFetch(response);
      expect(await fetchSettings("https://api.example", "token", fetcher)).toEqual({
        kind: "failed",
      });
    }
  });
});
