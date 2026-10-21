import type { Session, SignInResult } from "@take-my-word/cognito";
import {
  challengeCookie,
  clearedSessionCookies,
  needsRefresh,
  sessionCookies,
  type Challenge,
  type CookieToSet,
  type WebSession,
} from "./session.ts";

export interface CognitoPort {
  signIn(username: string, password: string): Promise<SignInResult>;
  completeNewPassword(challenge: Challenge, newPassword: string): Promise<Session>;
  confirmDevice(session: Session): Promise<string>;
  refresh(refreshToken: string, deviceKey: string): Promise<Session>;
  forgetDevice(accessToken: string, deviceKey: string): Promise<void>;
  revokeToken(refreshToken: string): Promise<void>;
}

export interface AuthDeps {
  cognito: CognitoPort;
  key: Buffer;
  now: () => number;
  log: (message: string, error: unknown) => void;
}

export type SignInOutcome =
  | { kind: "signed-in"; cookies: CookieToSet[] }
  | { kind: "new-password-required"; cookies: CookieToSet[] }
  | { kind: "invalid-credentials" }
  | { kind: "unavailable" };

export type NewPasswordOutcome =
  | { kind: "signed-in"; cookies: CookieToSet[] }
  | { kind: "invalid-password" }
  | { kind: "expired"; cookies: CookieToSet[] }
  | { kind: "unavailable" };

export type RefreshOutcome =
  | { kind: "fresh"; session: WebSession; cookies: CookieToSet[] }
  | { kind: "signed-out"; cookies: CookieToSet[] }
  | { kind: "unavailable" };

const credentialErrors = new Set([
  "NotAuthorizedException",
  "UserNotFoundException",
  "PasswordResetRequiredException",
  "UserNotConfirmedException",
]);

const deadRefreshErrors = new Set(["NotAuthorizedException", "RefreshTokenReuseException"]);

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

async function establish(
  deps: AuthDeps,
  session: Session,
  remember: boolean,
): Promise<CookieToSet[]> {
  const deviceKey = await deps.cognito.confirmDevice(session);
  return sessionCookies(
    { accessToken: session.accessToken, refreshToken: session.refreshToken, deviceKey, remember },
    deps.key,
  );
}

export async function signIn(
  deps: AuthDeps,
  input: { username: string; password: string; remember: boolean },
): Promise<SignInOutcome> {
  try {
    const result = await deps.cognito.signIn(input.username, input.password);
    if (result.kind === "new-password-required") {
      return {
        kind: "new-password-required",
        cookies: [
          challengeCookie(
            {
              username: result.username,
              challengeSession: result.challengeSession,
              remember: input.remember,
            },
            deps.key,
          ),
        ],
      };
    }
    return { kind: "signed-in", cookies: await establish(deps, result.session, input.remember) };
  } catch (error) {
    if (credentialErrors.has(errorName(error))) return { kind: "invalid-credentials" };
    deps.log("sign-in failed", error);
    return { kind: "unavailable" };
  }
}

export async function completeNewPassword(
  deps: AuthDeps,
  challenge: Challenge | null,
  newPassword: string,
): Promise<NewPasswordOutcome> {
  if (challenge === null) return { kind: "expired", cookies: clearedSessionCookies() };
  try {
    const session = await deps.cognito.completeNewPassword(challenge, newPassword);
    const cookies = await establish(deps, session, challenge.remember);
    return { kind: "signed-in", cookies: [...clearedSessionCookies(), ...cookies] };
  } catch (error) {
    const name = errorName(error);
    if (name === "InvalidPasswordException") return { kind: "invalid-password" };
    if (name === "NotAuthorizedException" || name === "CodeMismatchException") {
      return { kind: "expired", cookies: clearedSessionCookies() };
    }
    deps.log("new password failed", error);
    return { kind: "unavailable" };
  }
}

export async function refreshSession(deps: AuthDeps, session: WebSession): Promise<RefreshOutcome> {
  if (!needsRefresh(session, deps.now())) return { kind: "fresh", session, cookies: [] };
  try {
    const renewed = await deps.cognito.refresh(session.refreshToken, session.deviceKey);
    const next: WebSession = {
      accessToken: renewed.accessToken,
      refreshToken: renewed.refreshToken,
      deviceKey: session.deviceKey,
      remember: session.remember,
    };
    return { kind: "fresh", session: next, cookies: sessionCookies(next, deps.key) };
  } catch (error) {
    if (deadRefreshErrors.has(errorName(error))) {
      deps.log("refresh rejected", error);
      return { kind: "signed-out", cookies: clearedSessionCookies() };
    }
    deps.log("refresh failed", error);
    return { kind: "unavailable" };
  }
}

export async function signOut(deps: AuthDeps, session: WebSession | null): Promise<CookieToSet[]> {
  if (session === null) return clearedSessionCookies();
  const refreshed = await refreshSession(deps, session);
  const current = refreshed.kind === "fresh" ? refreshed.session : session;
  try {
    await deps.cognito.forgetDevice(current.accessToken, current.deviceKey);
  } catch (error) {
    deps.log("forget device failed", error);
  }
  try {
    await deps.cognito.revokeToken(current.refreshToken);
  } catch (error) {
    deps.log("revoke failed", error);
  }
  return clearedSessionCookies();
}
