import {
  appRuleListSchema,
  dictionaryListSchema,
  historyLimits,
  historyPageSchema,
  settingsSchema,
  styleListSchema,
  type AppRule,
  type DictionaryTerm,
  type HistoryItem,
  type Settings,
  type Style,
} from "@take-my-word/shared";
import type { z } from "zod";

export type Loaded<T> = { kind: "ok"; value: T } | { kind: "failed" };

export type Deleted = "deleted" | "not-found" | "unauthorized" | "failed";

export interface HistorySlice {
  items: HistoryItem[];
  more: boolean;
}

export interface AccountApi {
  settings(): Promise<Loaded<Settings>>;
  styles(): Promise<Loaded<Style[]>>;
  appRules(): Promise<Loaded<AppRule[]>>;
  dictionary(): Promise<Loaded<DictionaryTerm[]>>;
  history(shown: number): Promise<Loaded<HistorySlice>>;
  deleteDictation(id: string): Promise<Deleted>;
}

export const maxHistoryShown = 1000;

export function accountApi(
  apiUrl: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): AccountApi {
  const call = (path: string, method = "GET") =>
    fetcher(new URL(path, apiUrl), {
      method,
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

  async function read<S extends z.ZodType>(path: string, schema: S): Promise<Loaded<z.infer<S>>> {
    try {
      const response = await call(path);
      if (!response.ok) return { kind: "failed" };
      const parsed = schema.safeParse(await response.json());
      return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
    } catch {
      return { kind: "failed" };
    }
  }

  const mapped = <T, U>(loaded: Loaded<T>, map: (value: T) => U): Loaded<U> =>
    loaded.kind === "ok" ? { kind: "ok", value: map(loaded.value) } : loaded;

  return {
    settings: () => read("/me/settings", settingsSchema),
    styles: async () => mapped(await read("/styles", styleListSchema), (list) => list.styles),
    appRules: async () => mapped(await read("/app-rules", appRuleListSchema), (list) => list.rules),
    dictionary: async () =>
      mapped(await read("/dictionary", dictionaryListSchema), (list) => list.terms),

    async history(shown) {
      const wanted = Math.min(Math.max(1, Math.floor(shown)), maxHistoryShown) + 1;
      const items: HistoryItem[] = [];
      let cursor: string | undefined;
      do {
        const query = new URLSearchParams({
          limit: String(Math.min(historyLimits.maxPageSize, wanted - items.length)),
        });
        if (cursor !== undefined) query.set("cursor", cursor);
        const page = await read(`/dictations?${query.toString()}`, historyPageSchema);
        if (page.kind === "failed") return page;
        items.push(...page.value.items);
        cursor = page.value.cursor;
      } while (cursor !== undefined && items.length < wanted);
      const more = items.length === wanted;
      return { kind: "ok", value: { items: more ? items.slice(0, -1) : items, more } };
    },

    async deleteDictation(id) {
      try {
        const response = await call(`/dictations/${encodeURIComponent(id)}`, "DELETE");
        if (response.ok) return "deleted";
        if (response.status === 404) return "not-found";
        if (response.status === 401 || response.status === 403) return "unauthorized";
        return "failed";
      } catch {
        return "failed";
      }
    },
  };
}
