import {
  dictionaryLimits,
  dictionaryTermInputSchema,
  dictionaryTermUpdateSchema,
  normalizeTerm,
  type DictionaryList,
  type DictionaryTerm,
} from "@take-my-word/shared";
import { Hono } from "hono";
import { readJson, type ApiEnv } from "../api/context.ts";
import { HttpError } from "../lib/http-error.ts";
import { encodePathId, keyFromPathId } from "../lib/path-id.ts";
import type { DictionaryStore, TermRecord } from "./store.ts";

export interface DictionaryRoutesDeps {
  dictionary: DictionaryStore;
  now: () => Date;
}

function present({
  key,
  term,
  aliases,
  useCount,
  lastUsedAt,
  createdAt,
}: TermRecord): DictionaryTerm {
  return { id: encodePathId(key), term, aliases, useCount, lastUsedAt, createdAt };
}

function keyFromId(id: string): string {
  return keyFromPathId(id, (key) => normalizeTerm(key) === key);
}

function keyOf(term: string): string {
  const key = normalizeTerm(term);
  if (key === "") throw new HttpError("bad_request", "A term needs at least one letter or digit.");
  return key;
}

export function distinctAliases(termKeyValue: string, aliases: readonly string[]): string[] {
  const seen = new Set([termKeyValue]);
  return aliases.filter((alias) => {
    const key = normalizeTerm(alias);
    if (key === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const notFound = () => new HttpError("not_found", "That term is not in your dictionary.");

export function dictionaryRoutes({ dictionary, now }: DictionaryRoutesDeps) {
  return new Hono<ApiEnv>()
    .get("/", async (c) => {
      const terms = await dictionary.list(c.var.userId);
      terms.sort((a, b) => a.key.localeCompare(b.key));
      const body: DictionaryList = { terms: terms.map(present) };
      return c.json(body);
    })
    .post("/", async (c) => {
      const userId = c.var.userId;
      const input = await readJson(c, dictionaryTermInputSchema);
      const key = keyOf(input.term);
      if ((await dictionary.count(userId)) >= dictionaryLimits.terms) {
        throw new HttpError(
          "bad_request",
          `A dictionary holds at most ${dictionaryLimits.terms} terms.`,
        );
      }
      const createdAt = now().toISOString();
      const record: TermRecord = {
        key,
        term: input.term,
        aliases: distinctAliases(key, input.aliases),
        useCount: 1,
        lastUsedAt: createdAt,
        createdAt,
      };
      if (!(await dictionary.add(userId, record))) {
        throw new HttpError("conflict", "That term is already in your dictionary.");
      }
      return c.json(present(record), 201);
    })
    .put("/:id", async (c) => {
      const key = keyFromId(c.req.param("id"));
      const { aliases } = await readJson(c, dictionaryTermUpdateSchema);
      const updated = await dictionary.updateAliases(
        c.var.userId,
        key,
        distinctAliases(key, aliases),
      );
      if (!updated) throw notFound();
      return c.json(present(updated));
    })
    .delete("/:id", async (c) => {
      const key = keyFromId(c.req.param("id"));
      if (!(await dictionary.remove(c.var.userId, key))) throw notFound();
      return c.body(null, 204);
    });
}
