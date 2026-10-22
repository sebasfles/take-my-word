import { releaseVersionReader } from "../release.ts";

export const latestDesktopVersion = releaseVersionReader({
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  timeoutMs: 2500,
  ttlMs: 15 * 60 * 1000,
});
