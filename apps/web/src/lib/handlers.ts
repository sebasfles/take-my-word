import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { AccountApi } from "./api.ts";
import { completeNewPassword, refreshSession, signIn, signOut, type AuthDeps } from "./auth.ts";
import { isLocale, localeCookieName } from "./i18n.ts";
import { isSameOrigin } from "./origin.ts";
import { preferenceCookie } from "./preference.ts";
import { isTheme, themeCookieName } from "./theme.ts";
import {
  clearedSessionCookies,
  needsRefresh,
  readChallenge,
  readSession,
  type CookieToSet,
} from "./session.ts";

export interface HandlerDeps extends AuthDeps {
  webOrigin: string;
}

export type Deps = () => Promise<HandlerDeps>;

export interface DictationHandlerDeps {
  key: Buffer;
  now: () => number;
  webOrigin: string;
  api: (accessToken: string) => Pick<AccountApi, "deleteDictation">;
}

const signInSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(256),
  remember: z.boolean(),
});

const newPasswordSchema = z.object({ newPassword: z.string().min(1).max(256) });

const localeSchema = z.object({ locale: z.string().refine(isLocale) });

const themeSchema = z.object({ theme: z.string().refine(isTheme) });

function json(body: unknown, status: number, cookies: CookieToSet[] = []): NextResponse {
  const response = NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
  for (const cookie of cookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

async function readBody<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function jar(request: NextRequest) {
  return { get: (name: string) => request.cookies.get(name)?.value };
}

const forbidden = () => json({ error: "forbidden" }, 403);
const badRequest = () => json({ error: "bad_request" }, 400);

export function signInHandler(deps: Deps) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const d = await deps();
    if (!isSameOrigin(request, d.webOrigin)) return forbidden();
    const input = await readBody(request, signInSchema);
    if (input === null) return badRequest();
    const outcome = await signIn(d, input);
    switch (outcome.kind) {
      case "signed-in":
        return json({ step: "done" }, 200, outcome.cookies);
      case "new-password-required":
        return json({ step: "new-password" }, 200, outcome.cookies);
      case "invalid-credentials":
        return json({ error: "invalid_credentials" }, 401);
      case "unavailable":
        return json({ error: "unavailable" }, 503);
    }
  };
}

export function newPasswordHandler(deps: Deps) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const d = await deps();
    if (!isSameOrigin(request, d.webOrigin)) return forbidden();
    const input = await readBody(request, newPasswordSchema);
    if (input === null) return badRequest();
    const outcome = await completeNewPassword(
      d,
      readChallenge(jar(request), d.key),
      input.newPassword,
    );
    switch (outcome.kind) {
      case "signed-in":
        return json({ step: "done" }, 200, outcome.cookies);
      case "invalid-password":
        return json({ error: "invalid_password" }, 400);
      case "expired":
        return json({ error: "expired" }, 401, outcome.cookies);
      case "unavailable":
        return json({ error: "unavailable" }, 503);
    }
  };
}

export function refreshHandler(deps: Deps) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const d = await deps();
    if (!isSameOrigin(request, d.webOrigin)) return forbidden();
    const session = readSession(jar(request), d.key);
    if (session === null) return json({ error: "signed_out" }, 401, clearedSessionCookies());
    const outcome = await refreshSession(d, session);
    switch (outcome.kind) {
      case "fresh":
        return json({ step: "done" }, 200, outcome.cookies);
      case "signed-out":
        return json({ error: "signed_out" }, 401, outcome.cookies);
      case "unavailable":
        return json({ error: "unavailable" }, 503);
    }
  };
}

export function signOutHandler(deps: Deps) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const d = await deps();
    if (!isSameOrigin(request, d.webOrigin)) return forbidden();
    const cookies = await signOut(d, readSession(jar(request), d.key));
    return json({ step: "done" }, 200, cookies);
  };
}

export function localeHandler(webOrigin: () => string) {
  return async (request: NextRequest): Promise<NextResponse> => {
    if (!isSameOrigin(request, webOrigin())) return forbidden();
    const input = await readBody(request, localeSchema);
    if (input === null) return badRequest();
    return json({ locale: input.locale }, 200, [preferenceCookie(localeCookieName, input.locale)]);
  };
}

export function themeHandler(webOrigin: () => string) {
  return async (request: NextRequest): Promise<NextResponse> => {
    if (!isSameOrigin(request, webOrigin())) return forbidden();
    const input = await readBody(request, themeSchema);
    if (input === null) return badRequest();
    return json({ theme: input.theme }, 200, [preferenceCookie(themeCookieName, input.theme)]);
  };
}

const pathIdPattern = /^[\w-]{1,512}$/;

export function deleteDictationHandler(deps: () => Promise<DictationHandlerDeps>) {
  return async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const d = await deps();
    if (!isSameOrigin(request, d.webOrigin)) return forbidden();
    const session = readSession(jar(request), d.key);
    if (session === null) return json({ error: "signed_out" }, 401);
    if (needsRefresh(session, d.now())) return json({ error: "renew" }, 401);
    const { id } = await context.params;
    if (!pathIdPattern.test(id)) return badRequest();
    switch (await d.api(session.accessToken).deleteDictation(id)) {
      case "deleted":
        return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
      case "not-found":
        return json({ error: "not_found" }, 404);
      case "unauthorized":
        return json({ error: "renew" }, 401);
      case "failed":
        return json({ error: "unavailable" }, 503);
    }
  };
}
