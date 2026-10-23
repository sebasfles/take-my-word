import { desktopReleaseManifestSchema } from "@take-my-word/shared";

export interface ReleaseDeps {
  manifestUrl: string;
  fetch: typeof fetch;
  now: () => number;
  timeoutMs: number;
  ttlMs: number;
}

export function releaseVersionReader(deps: ReleaseDeps) {
  let cached: { version: string | null; at: number } | null = null;
  let inflight: Promise<string | null> | null = null;

  async function load(): Promise<string | null> {
    try {
      const response = await deps.fetch(deps.manifestUrl, {
        signal: AbortSignal.timeout(deps.timeoutMs),
        redirect: "follow",
      });
      if (!response.ok) return null;
      const parsed = desktopReleaseManifestSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.version : null;
    } catch {
      return null;
    }
  }

  return async function latestVersion(): Promise<string | null> {
    if (cached !== null && deps.now() - cached.at < deps.ttlMs) return cached.version;
    inflight ??= load().then((version) => {
      cached = { version: version ?? cached?.version ?? null, at: deps.now() };
      inflight = null;
      return cached.version;
    });
    return inflight;
  };
}
