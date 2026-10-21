import { afterEach, describe, expect, it } from "vitest";
import { fetchSettings } from "../src/lib/api.ts";
import {
  apiUrl,
  clock,
  cookiesOf,
  env,
  logged,
  refresh,
  refreshPastExpiry,
  sessionOf,
  signIn,
  signOut,
  signOutLatest,
} from "./harness.ts";

async function signInCrewE2e(): Promise<string> {
  const response = await signIn(env("CREW_E2E_USERNAME"), env("CREW_E2E_PASSWORD"));
  expect(response.status).toBe(200);
  for (const header of response.headers.getSetCookie()) {
    console.info(`${header.slice(0, header.indexOf("="))}: ${Buffer.byteLength(header)} bytes`);
    expect(Buffer.byteLength(header)).toBeLessThan(4096);
  }
  return cookiesOf(response);
}

describe("web session against the dev pool", () => {
  afterEach(signOutLatest);

  it("refreshes an expired session through the request path with the device key", async () => {
    const signedIn = await signInCrewE2e();
    const before = sessionOf(signedIn);
    const response = await refreshPastExpiry(signedIn);
    expect(response.status).toBe(200);
    for (const header of response.headers.getSetCookie()) {
      expect(Buffer.byteLength(header)).toBeLessThan(4096);
    }
    const after = sessionOf(cookiesOf(response));
    expect(after.refreshToken).not.toBe(before.refreshToken);
    expect(after.accessToken).not.toBe(before.accessToken);
    expect(after.deviceKey).toBe(before.deviceKey);

    const settings = await fetchSettings(apiUrl, after.accessToken);
    expect(settings.kind).toBe("ok");
  });

  it("lets a second tab renewing after the first reuse its cookies without a second rotation", async () => {
    const signedIn = await signInCrewE2e();
    const firstTab = await refreshPastExpiry(signedIn);
    expect(firstTab.status).toBe(200);
    const renewed = cookiesOf(firstTab);
    clock.now = Date.now();
    const secondTab = await refresh(renewed);
    expect(secondTab.status).toBe(200);
    expect(secondTab.headers.getSetCookie()).toEqual([]);
    const settings = await fetchSettings(apiUrl, sessionOf(renewed).accessToken);
    expect(settings.kind).toBe("ok");
    const later = await refreshPastExpiry(renewed);
    expect(later.status).toBe(200);
  });

  it("signs the session out for good: its refresh token no longer renews", async () => {
    const signedIn = await signInCrewE2e();
    expect((await signOut(signedIn)).status).toBe(200);
    const response = await refreshPastExpiry(signedIn);
    expect(response.status).toBe(401);
    expect(logged).toEqual(["refresh rejected: NotAuthorizedException"]);
  });
});
