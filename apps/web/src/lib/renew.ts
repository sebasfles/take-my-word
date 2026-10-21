import { withRefreshLock } from "./refresh-lock.ts";
import { signedFetch } from "./signed-fetch.ts";

export function renewSession(): Promise<number> {
  return withRefreshLock(async () => {
    try {
      return (await signedFetch("/api/session/refresh", { method: "POST" })).status;
    } catch {
      return 0;
    }
  });
}
