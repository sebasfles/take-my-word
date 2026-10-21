import { settingsSchema, type Settings } from "@take-my-word/shared";

export type SettingsResult = { kind: "ok"; settings: Settings } | { kind: "failed" };

export async function fetchSettings(
  apiUrl: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<SettingsResult> {
  try {
    const response = await fetcher(new URL("/me/settings", apiUrl), {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) return { kind: "failed" };
    const parsed = settingsSchema.safeParse(await response.json());
    return parsed.success ? { kind: "ok", settings: parsed.data } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
