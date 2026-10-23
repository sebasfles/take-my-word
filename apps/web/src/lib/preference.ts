import { localeMaxAgeSeconds } from "./locale.ts";
import type { CookieToSet } from "./session.ts";

export function preferenceCookie(name: string, value: string): CookieToSet {
  return {
    name,
    value,
    options: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: localeMaxAgeSeconds,
    },
  };
}
