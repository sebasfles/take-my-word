import { describe, expect, it, vi } from "vitest";
import { latestManifestUrl, releaseVersionReader } from "./release.ts";

function reader(responses: (() => Promise<Response>)[], clock = { now: 0 }) {
  const fetch = vi.fn(() => (responses.shift() ?? (() => Promise.reject(new Error("none"))))());
  const read = releaseVersionReader({
    fetch,
    now: () => clock.now,
    timeoutMs: 50,
    ttlMs: 1000,
  });
  return { read, fetch, clock };
}

const manifest = (version: string) => () =>
  Promise.resolve(Response.json({ version, notes: "", platforms: {} }));

describe("releaseVersionReader", () => {
  it("reads the version from the latest release manifest", async () => {
    const { read, fetch } = reader([manifest("0.1.1")]);
    expect(await read()).toBe("0.1.1");
    expect(fetch).toHaveBeenCalledWith(latestManifestUrl, expect.anything());
  });

  it("serves the cached version until it expires, sharing one request", async () => {
    const { read, fetch, clock } = reader([manifest("0.1.1"), manifest("0.2.0")]);
    expect(await Promise.all([read(), read()])).toEqual(["0.1.1", "0.1.1"]);
    clock.now = 999;
    expect(await read()).toBe("0.1.1");
    expect(fetch).toHaveBeenCalledTimes(1);
    clock.now = 1000;
    expect(await read()).toBe("0.2.0");
  });

  it("gives no version when GitHub fails or answers nonsense", async () => {
    for (const failure of [
      () => Promise.reject(new Error("timeout")),
      () => Promise.resolve(new Response("nope", { status: 503 })),
      () => Promise.resolve(Response.json({ version: "latest" })),
      () => Promise.resolve(new Response("{")),
    ]) {
      expect(await reader([failure]).read()).toBeNull();
    }
  });

  it("keeps the last good version through a failed refresh", async () => {
    const { read, clock } = reader([manifest("0.1.1"), () => Promise.reject(new Error("down"))]);
    expect(await read()).toBe("0.1.1");
    clock.now = 5000;
    expect(await read()).toBe("0.1.1");
  });

  it("stops waiting for a slow GitHub", async () => {
    const slow = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    const read = releaseVersionReader({
      fetch: slow as typeof fetch,
      now: () => 0,
      timeoutMs: 20,
      ttlMs: 1000,
    });
    expect(await read()).toBeNull();
  });
});
