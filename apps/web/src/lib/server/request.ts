import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { appAccess, type Access } from "../gate.ts";
import { dictionary, localeCookieName, localeFrom, type Locale } from "../i18n.ts";
import { accessClaims, readSession, type WebSession } from "../session.ts";
import { getCookieKey } from "./config.ts";

export const currentLocale = cache(async (): Promise<Locale> => {
  return localeFrom((await cookies()).get(localeCookieName)?.value);
});

export async function currentDictionary() {
  return dictionary(await currentLocale());
}

export const currentSession = cache(async (): Promise<WebSession | null> => {
  const jar = await cookies();
  return readSession({ get: (name) => jar.get(name)?.value }, await getCookieKey());
});

export async function requireAppSession(): Promise<Exclude<Access, { kind: "redirect" }>> {
  const access = appAccess(await currentSession(), Date.now());
  if (access.kind === "redirect") redirect(access.to);
  return access;
}

export async function currentUsername(): Promise<string> {
  const session = await currentSession();
  return session === null ? "" : (accessClaims(session.accessToken)?.username ?? "");
}
