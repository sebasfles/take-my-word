import { describe, expect, it } from "vitest";
import { cognitoError, fakeDeps } from "../testing/fake-cognito.ts";
import { fakeAccessToken } from "../testing/tokens.ts";
import { completeNewPassword, refreshSession, signIn, signOut } from "./auth.ts";
import {
  challengeCookieName,
  readChallenge,
  readSession,
  type CookieToSet,
  type WebSession,
} from "./session.ts";

function jarOf(cookies: CookieToSet[]) {
  const values = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  return { get: (name: string) => values.get(name) };
}

const credentials = { username: "crew-e2e", password: "Secret-password-1", remember: true };

describe("signIn", () => {
  it("confirms the device and seals the tokens with the device key", async () => {
    const { deps, cognito } = fakeDeps();
    const outcome = await signIn(deps, credentials);
    if (outcome.kind !== "signed-in") throw new Error(outcome.kind);
    expect(cognito.calls).toEqual(["signIn:crew-e2e", "confirmDevice:us-east-1_device"]);
    expect(readSession(jarOf(outcome.cookies), deps.key)).toMatchObject({
      refreshToken: "refresh-1",
      deviceKey: "us-east-1_device",
      remember: true,
    });
  });

  it("keeps the new-password challenge in its own sealed cookie and signs nobody in", async () => {
    const { deps, cognito } = fakeDeps();
    cognito.signInResult = {
      kind: "new-password-required",
      username: "uuid-of-ana",
      challengeSession: "cognito-session",
    };
    const outcome = await signIn(deps, credentials);
    if (outcome.kind !== "new-password-required") throw new Error(outcome.kind);
    expect(outcome.cookies.map((cookie) => cookie.name)).toEqual([challengeCookieName]);
    expect(readChallenge(jarOf(outcome.cookies), deps.key)).toEqual({
      username: "uuid-of-ana",
      challengeSession: "cognito-session",
      remember: true,
    });
    expect(cognito.calls).not.toContain("confirmDevice:us-east-1_device");
  });

  it("answers one generic outcome for a wrong password and for an unknown user", async () => {
    for (const name of ["NotAuthorizedException", "UserNotFoundException"]) {
      const { deps, cognito, logged } = fakeDeps();
      cognito.signInResult = cognitoError(name);
      expect(await signIn(deps, credentials)).toEqual({ kind: "invalid-credentials" });
      expect(logged).toEqual([]);
    }
  });

  it("tells an unreachable service apart", async () => {
    const { deps, cognito } = fakeDeps();
    cognito.signInResult = cognitoError("TimeoutError");
    expect(await signIn(deps, credentials)).toEqual({ kind: "unavailable" });
  });
});

describe("completeNewPassword", () => {
  const challenge = { username: "uuid-of-ana", challengeSession: "s", remember: false };

  it("signs in with the new password and drops the challenge", async () => {
    const { deps, cognito } = fakeDeps();
    const outcome = await completeNewPassword(deps, challenge, "New-password-12");
    if (outcome.kind !== "signed-in") throw new Error(outcome.kind);
    expect(cognito.calls).toEqual([
      "completeNewPassword:uuid-of-ana",
      "confirmDevice:us-east-1_device",
    ]);
    const cleared = outcome.cookies.find((cookie) => cookie.name === challengeCookieName);
    expect(cleared?.options.maxAge).toBe(0);
    expect(readSession(jarOf(outcome.cookies), deps.key)?.remember).toBe(false);
  });

  it("asks again for a password the pool rejects", async () => {
    const { deps, cognito } = fakeDeps();
    cognito.newPasswordError = cognitoError("InvalidPasswordException");
    expect(await completeNewPassword(deps, challenge, "short")).toEqual({
      kind: "invalid-password",
    });
  });

  it("restarts the sign-in when the challenge is missing or expired", async () => {
    const { deps, cognito } = fakeDeps();
    expect((await completeNewPassword(deps, null, "New-password-12")).kind).toBe("expired");
    cognito.newPasswordError = cognitoError("NotAuthorizedException");
    expect((await completeNewPassword(deps, challenge, "New-password-12")).kind).toBe("expired");
  });
});

describe("refreshSession", () => {
  function session(expSeconds: number): WebSession {
    return {
      accessToken: fakeAccessToken({ username: "crew-e2e", exp: expSeconds }),
      refreshToken: "refresh-0",
      deviceKey: "us-east-1_device",
      remember: true,
    };
  }

  it("leaves a fresh session alone without calling Cognito", async () => {
    const { deps, cognito } = fakeDeps();
    const fresh = session(deps.clock.now / 1000 + 3600);
    expect(await refreshSession(deps, fresh)).toEqual({
      kind: "fresh",
      session: fresh,
      cookies: [],
    });
    expect(cognito.calls).toEqual([]);
  });

  it("renews an expired session with the device key and stores the rotated refresh token", async () => {
    const { deps, cognito } = fakeDeps();
    const expired = session(deps.clock.now / 1000 - 1);
    const outcome = await refreshSession(deps, expired);
    if (outcome.kind !== "fresh") throw new Error(outcome.kind);
    expect(cognito.calls).toEqual(["refresh:refresh-0:us-east-1_device"]);
    const stored = readSession(jarOf(outcome.cookies), deps.key);
    expect(stored).toEqual(outcome.session);
    expect(stored).toMatchObject({
      refreshToken: "refresh-1",
      deviceKey: "us-east-1_device",
      remember: true,
    });
    expect(outcome.cookies.every((cookie) => cookie.options.maxAge === 400 * 24 * 60 * 60)).toBe(
      true,
    );
  });

  it("signs out a revoked session", async () => {
    const { deps, cognito } = fakeDeps();
    cognito.refreshError = cognitoError("NotAuthorizedException");
    const outcome = await refreshSession(deps, session(deps.clock.now / 1000 - 1));
    expect(outcome.kind).toBe("signed-out");
  });

  it("keeps the session when Cognito cannot be reached", async () => {
    const { deps, cognito } = fakeDeps();
    cognito.refreshError = cognitoError("TimeoutError");
    expect(await refreshSession(deps, session(deps.clock.now / 1000 - 1))).toEqual({
      kind: "unavailable",
    });
  });
});

describe("signOut", () => {
  it("forgets the device before revoking the refresh token, then clears the cookies", async () => {
    const { deps, cognito } = fakeDeps();
    const cookies = await signOut(deps, {
      accessToken: fakeAccessToken({ username: "crew-e2e", exp: deps.clock.now / 1000 + 3600 }),
      refreshToken: "refresh-0",
      deviceKey: "us-east-1_device",
      remember: false,
    });
    expect(cognito.calls).toEqual(["forgetDevice:us-east-1_device", "revokeToken:refresh-0"]);
    expect(cookies.every((cookie) => cookie.options.maxAge === 0)).toBe(true);
  });

  it("refreshes an expired access token first so the device can still be forgotten", async () => {
    const { deps, cognito } = fakeDeps();
    await signOut(deps, {
      accessToken: fakeAccessToken({ username: "crew-e2e", exp: deps.clock.now / 1000 - 1 }),
      refreshToken: "refresh-0",
      deviceKey: "us-east-1_device",
      remember: false,
    });
    expect(cognito.calls).toEqual([
      "refresh:refresh-0:us-east-1_device",
      "forgetDevice:us-east-1_device",
      "revokeToken:refresh-1",
    ]);
  });

  it("clears the cookies even when Cognito fails", async () => {
    const { deps, cognito } = fakeDeps();
    cognito.forgetError = cognitoError("TimeoutError");
    cognito.revokeError = cognitoError("TimeoutError");
    const cookies = await signOut(deps, {
      accessToken: fakeAccessToken({ username: "crew-e2e", exp: deps.clock.now / 1000 + 3600 }),
      refreshToken: "refresh-0",
      deviceKey: "us-east-1_device",
      remember: false,
    });
    expect(cookies.every((cookie) => cookie.value === "")).toBe(true);
  });
});
