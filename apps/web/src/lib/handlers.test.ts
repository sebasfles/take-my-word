import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { cognitoError, fakeDeps } from "../testing/fake-cognito.ts";
import { fakeAccessToken } from "../testing/tokens.ts";
import {
  localeHandler,
  newPasswordHandler,
  refreshHandler,
  signInHandler,
  signOutHandler,
  type HandlerDeps,
} from "./handlers.ts";
import { localeCookieName, localeFrom } from "./i18n.ts";
import { refreshCookieName, sessionCookieName, sessionCookies } from "./session.ts";

const origin = "https://dev.takemyword.fless.dev";

function setup() {
  const { deps, cognito, logged } = fakeDeps();
  const handlerDeps: HandlerDeps = { ...deps, webOrigin: origin };
  return { deps: () => Promise.resolve(handlerDeps), handlerDeps, cognito, logged };
}

function post(path: string, body: unknown, headers: Record<string, string> = { origin }) {
  return new NextRequest(new URL(path, origin), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function setCookies(response: Response): Map<string, string> {
  return new Map(
    response.headers.getSetCookie().map((header) => {
      const name = header.slice(0, header.indexOf("="));
      return [name, header];
    }),
  );
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");
}

const credentials = { username: "crew-e2e", password: "Secret-password-1", remember: false };

describe("POST /api/session", () => {
  it("sets both session cookies HttpOnly, Secure and SameSite=Lax", async () => {
    const { deps } = setup();
    const response = await signInHandler(deps)(post("/api/session", credentials));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ step: "done" });
    const cookies = setCookies(response);
    for (const name of [sessionCookieName, refreshCookieName]) {
      const header = cookies.get(name) ?? "";
      expect(header).toMatch(/; HttpOnly/i);
      expect(header).toMatch(/; Secure/i);
      expect(header).toMatch(/; SameSite=lax/i);
      expect(header).toMatch(/; Path=\//i);
      expect(header).not.toMatch(/Max-Age|Expires/i);
    }
  });

  it("persists the cookies for 400 days when remember me is checked", async () => {
    const { deps } = setup();
    const response = await signInHandler(deps)(
      post("/api/session", { ...credentials, remember: true }),
    );
    for (const header of setCookies(response).values()) {
      expect(header).toMatch(/Max-Age=34560000/);
    }
  });

  it("answers wrong credentials with one generic error and no cookie", async () => {
    const { deps, cognito } = setup();
    cognito.signInResult = cognitoError("NotAuthorizedException");
    const response = await signInHandler(deps)(post("/api/session", credentials));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_credentials" });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("answers an unreachable Cognito with its own error", async () => {
    const { deps, cognito } = setup();
    cognito.signInResult = cognitoError("TimeoutError");
    const response = await signInHandler(deps)(post("/api/session", credentials));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("refuses a request from another origin or without one before calling Cognito", async () => {
    for (const headers of [{ origin: "https://evil.example" }, {}]) {
      const { deps, cognito } = setup();
      const response = await signInHandler(deps)(post("/api/session", credentials, headers));
      expect(response.status).toBe(403);
      expect(cognito.calls).toEqual([]);
    }
  });

  it("refuses a malformed body", async () => {
    const { deps } = setup();
    const response = await signInHandler(deps)(post("/api/session", { username: "x" }));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/session/password", () => {
  it("completes the challenge the sign-in left in its cookie", async () => {
    const { deps, cognito } = setup();
    cognito.signInResult = {
      kind: "new-password-required",
      username: "uuid-of-ana",
      challengeSession: "cognito-session",
    };
    const started = await signInHandler(deps)(post("/api/session", credentials));
    expect(await started.json()).toEqual({ step: "new-password" });
    const response = await newPasswordHandler(deps)(
      post(
        "/api/session/password",
        { newPassword: "New-password-12" },
        { origin, cookie: cookieHeader(started) },
      ),
    );
    expect(response.status).toBe(200);
    expect(cognito.calls).toContain("completeNewPassword:uuid-of-ana");
    expect(setCookies(response).get(sessionCookieName)).toMatch(/HttpOnly/i);
  });

  it("refuses a request from another origin", async () => {
    const { deps } = setup();
    const response = await newPasswordHandler(deps)(
      post("/api/session/password", { newPassword: "x" }, { origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
  });
});

describe("POST /api/session/refresh", () => {
  function expiredCookies(handlerDeps: HandlerDeps): string {
    return sessionCookies(
      {
        accessToken: fakeAccessToken({ username: "crew-e2e", exp: handlerDeps.now() / 1000 - 1 }),
        refreshToken: "refresh-0",
        deviceKey: "us-east-1_device",
        remember: true,
      },
      handlerDeps.key,
    )
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }

  it("renews an expired session with the device key and sets the rotated cookies", async () => {
    const { deps, handlerDeps, cognito } = setup();
    const response = await refreshHandler(deps)(
      post("/api/session/refresh", {}, { origin, cookie: expiredCookies(handlerDeps) }),
    );
    expect(response.status).toBe(200);
    expect(cognito.calls).toEqual(["refresh:refresh-0:us-east-1_device"]);
    expect(setCookies(response).get(refreshCookieName)).toMatch(/Max-Age=34560000/);
  });

  it("leaves Cognito alone for a request that already carries the renewed cookies", async () => {
    const { deps, handlerDeps, cognito } = setup();
    const renewed = await refreshHandler(deps)(
      post("/api/session/refresh", {}, { origin, cookie: expiredCookies(handlerDeps) }),
    );
    const again = await refreshHandler(deps)(
      post("/api/session/refresh", {}, { origin, cookie: cookieHeader(renewed) }),
    );
    expect(again.status).toBe(200);
    expect(again.headers.getSetCookie()).toEqual([]);
    expect(cognito.calls).toHaveLength(1);
  });

  it("signs out a tampered session and clears it", async () => {
    const { deps, cognito } = setup();
    const response = await refreshHandler(deps)(
      post(
        "/api/session/refresh",
        {},
        { origin, cookie: `${sessionCookieName}=v1.forged; ${refreshCookieName}=v1.forged` },
      ),
    );
    expect(response.status).toBe(401);
    expect(setCookies(response).get(sessionCookieName)).toMatch(/Max-Age=0/);
    expect(cognito.calls).toEqual([]);
  });

  it("signs out a refresh token Cognito reports as reused", async () => {
    const { deps, handlerDeps, cognito } = setup();
    cognito.refreshError = cognitoError("RefreshTokenReuseException");
    const response = await refreshHandler(deps)(
      post("/api/session/refresh", {}, { origin, cookie: expiredCookies(handlerDeps) }),
    );
    expect(response.status).toBe(401);
  });

  it("keeps the session when Cognito cannot be reached", async () => {
    const { deps, handlerDeps, cognito } = setup();
    cognito.refreshError = cognitoError("TimeoutError");
    const response = await refreshHandler(deps)(
      post("/api/session/refresh", {}, { origin, cookie: expiredCookies(handlerDeps) }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("refuses a request from another origin", async () => {
    const { deps, handlerDeps, cognito } = setup();
    const response = await refreshHandler(deps)(
      post(
        "/api/session/refresh",
        {},
        { origin: "https://evil.example", cookie: expiredCookies(handlerDeps) },
      ),
    );
    expect(response.status).toBe(403);
    expect(cognito.calls).toEqual([]);
  });
});

describe("POST /api/session/sign-out", () => {
  it("revokes the session and clears every session cookie", async () => {
    const { deps, cognito } = setup();
    const signedIn = await signInHandler(deps)(post("/api/session", credentials));
    const response = await signOutHandler(deps)(
      post("/api/session/sign-out", {}, { origin, cookie: cookieHeader(signedIn) }),
    );
    expect(response.status).toBe(200);
    expect(cognito.calls.slice(-2)).toEqual([
      "forgetDevice:us-east-1_device",
      "revokeToken:refresh-1",
    ]);
    for (const name of [sessionCookieName, refreshCookieName]) {
      expect(setCookies(response).get(name)).toMatch(/Max-Age=0/);
    }
  });

  it("refuses a request from another origin and keeps the session", async () => {
    const { deps, cognito } = setup();
    const response = await signOutHandler(deps)(
      post("/api/session/sign-out", {}, { origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(cognito.calls).toEqual([]);
  });
});

describe("POST /api/locale", () => {
  const handler = localeHandler(() => origin);

  it("switches the language through a cookie the pages read", async () => {
    const response = await handler(post("/api/locale", { locale: "en" }));
    expect(response.status).toBe(200);
    const header = setCookies(response).get(localeCookieName) ?? "";
    expect(header).toMatch(/^tmw-lang=en;/);
    expect(header).toMatch(/Max-Age=31536000/);
    expect(localeFrom(header.split(";")[0]?.split("=")[1])).toBe("en");
  });

  it("refuses an unknown language and a foreign origin", async () => {
    expect((await handler(post("/api/locale", { locale: "fr" }))).status).toBe(400);
    expect(
      (await handler(post("/api/locale", { locale: "en" }, { origin: "https://evil.example" })))
        .status,
    ).toBe(403);
  });
});
