import { needsRefresh, type WebSession } from "./session.ts";

export const signInPath = "/sign-in";
export const appPath = "/app";

export type Access =
  | { kind: "allow"; session: WebSession }
  | { kind: "renew"; session: WebSession }
  | { kind: "redirect"; to: string };

export function appAccess(session: WebSession | null, now: number): Access {
  if (session === null) return { kind: "redirect", to: signInPath };
  if (needsRefresh(session, now)) return { kind: "renew", session };
  return { kind: "allow", session };
}

export function signInRedirect(session: WebSession | null): string | null {
  return session === null ? null : appPath;
}

export type AppData<T> = { kind: "renew" } | { kind: "ready"; data: T };

export async function whenFresh<T>(
  access: Exclude<Access, { kind: "redirect" }>,
  load: (accessToken: string) => Promise<T>,
): Promise<AppData<T>> {
  if (access.kind === "renew") return { kind: "renew" };
  return { kind: "ready", data: await load(access.session.accessToken) };
}
