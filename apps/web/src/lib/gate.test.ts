import { describe, expect, it } from "vitest";
import { fakeAccessToken } from "../testing/tokens.ts";
import { appAccess, signInRedirect, whenFresh } from "./gate.ts";
import type { WebSession } from "./session.ts";

const now = Date.UTC(2026, 9, 21, 12);

function session(expSeconds: number): WebSession {
  return {
    accessToken: fakeAccessToken({ username: "ana", exp: expSeconds }),
    refreshToken: "r",
    deviceKey: "d",
    remember: false,
  };
}

describe("appAccess", () => {
  it("sends a visitor without a session to sign-in", () => {
    expect(appAccess(null, now)).toEqual({ kind: "redirect", to: "/sign-in" });
  });

  it("asks the browser to renew a session in its last minute or past it, without calling the API", () => {
    for (const exp of [now / 1000 + 30, now / 1000 - 3600]) {
      const expiring = session(exp);
      expect(appAccess(expiring, now)).toEqual({ kind: "renew", session: expiring });
    }
  });

  it("lets a fresh session in", () => {
    const fresh = session(now / 1000 + 3600);
    expect(appAccess(fresh, now)).toEqual({ kind: "allow", session: fresh });
  });
});

describe("signInRedirect", () => {
  it("sends a signed-in visitor of sign-in to the app and leaves others on the form", () => {
    expect(signInRedirect(session(now / 1000 + 3600))).toBe("/app");
    expect(signInRedirect(null)).toBeNull();
  });
});

describe("whenFresh", () => {
  it("renders the renew step without loading anything when the session is expiring", async () => {
    const loads: string[] = [];
    const access = appAccess(session(now / 1000 + 30), now);
    if (access.kind === "redirect") throw new Error("expected a session");
    const data = await whenFresh(access, (accessToken) => {
      loads.push(accessToken);
      return Promise.resolve("data");
    });
    expect(data).toEqual({ kind: "renew" });
    expect(loads).toEqual([]);
  });

  it("loads with the access token of a fresh session", async () => {
    const fresh = session(now / 1000 + 3600);
    const access = appAccess(fresh, now);
    if (access.kind === "redirect") throw new Error("expected a session");
    const data = await whenFresh(access, (accessToken) => Promise.resolve(accessToken));
    expect(data).toEqual({ kind: "ready", data: fresh.accessToken });
  });
});
