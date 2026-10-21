import { historyQuerySchema, type HistoryItem, type HistoryPage } from "@take-my-word/shared";
import { Hono } from "hono";
import { invalid, type ApiEnv } from "../api/context.ts";
import { HttpError } from "../lib/http-error.ts";
import { decodePathId, encodePathId, keyFromPathId } from "../lib/path-id.ts";
import { dictationPrefix } from "../lib/table.ts";
import type { DictationEntry, HistoryStore } from "./store.ts";

export interface HistoryRoutesDeps {
  history: HistoryStore;
}

const dictationSk = /^DICTATION#\d{4}-\d{2}-\d{2}T[\d:.]+Z#[\w-]+$/;

function skFromId(id: string): string {
  const suffix = keyFromPathId(id, (key) => dictationSk.test(`${dictationPrefix}${key}`));
  return `${dictationPrefix}${suffix}`;
}

function skFromCursor(cursor: string): string {
  const sk = decodePathId(cursor);
  if (sk === undefined || !dictationSk.test(sk)) {
    throw new HttpError("bad_request", "Invalid cursor.");
  }
  return sk;
}

function present({ sk, ...entry }: DictationEntry): HistoryItem {
  return { id: encodePathId(sk.slice(dictationPrefix.length)), ...entry };
}

export function historyRoutes({ history }: HistoryRoutesDeps) {
  return new Hono<ApiEnv>()
    .get("/", async (c) => {
      const query = historyQuerySchema.safeParse(c.req.query());
      if (!query.success) throw invalid(query.error, "query");
      const { cursor, limit } = query.data;
      const after = cursor === undefined ? undefined : skFromCursor(cursor);
      const { entries, last } = await history.page(c.var.userId, {
        limit,
        ...(after !== undefined && { after }),
      });
      const body: HistoryPage = {
        items: entries.map(present),
        ...(last !== undefined && { cursor: encodePathId(last) }),
      };
      return c.json(body);
    })
    .delete("/:id", async (c) => {
      const sk = skFromId(c.req.param("id"));
      if (!(await history.remove(c.var.userId, sk))) {
        throw new HttpError("not_found", "That dictation is not in your history.");
      }
      return c.body(null, 204);
    });
}
