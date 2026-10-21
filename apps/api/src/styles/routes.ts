import {
  builtinStyleIds,
  fallbackStyleId,
  styleInputSchema,
  styleLimits,
  type Style,
  type StyleList,
} from "@take-my-word/shared";
import { Hono } from "hono";
import { readJson, type ApiEnv } from "../api/context.ts";
import type { AppRuleStore } from "../app-rules/store.ts";
import { HttpError } from "../lib/http-error.ts";
import type { Logger } from "../lib/log.ts";
import type { SettingsStore } from "../settings/store.ts";
import { builtinStyles, isBuiltinStyle } from "./builtin/index.ts";
import type { StyleRecord, StyleStore } from "./store.ts";

export interface StyleRoutesDeps {
  styles: StyleStore;
  appRules: AppRuleStore;
  settings: SettingsStore;
  newId: () => string;
  now: () => Date;
  log: Logger;
}

const builtins: Style[] = builtinStyleIds.map((id) => ({
  id,
  ...builtinStyles[id],
  builtin: true,
}));

function present({ id, name, prompt }: StyleRecord): Style {
  return { id, name, prompt, builtin: false };
}

function editable(id: string): string {
  if (isBuiltinStyle(id)) throw new HttpError("forbidden", "Built-in styles cannot be changed.");
  return id;
}

const notFound = () => new HttpError("not_found", "That style does not exist.");

export function styleRoutes({ styles, appRules, settings, newId, now, log }: StyleRoutesDeps) {
  const releaseStyle = async (userId: string, styleId: string) => {
    const rules = await appRules.list(userId);
    await Promise.all([
      ...rules
        .filter((rule) => rule.styleId === styleId)
        .map((rule) => appRules.detachStyle(userId, rule.appId, styleId)),
      settings.resetDefaultStyle(userId, styleId, fallbackStyleId),
    ]);
  };

  return new Hono<ApiEnv>()
    .get("/", async (c) => {
      const custom = await styles.list(c.var.userId);
      custom.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const body: StyleList = { styles: [...builtins, ...custom.map(present)] };
      return c.json(body);
    })
    .post("/", async (c) => {
      const userId = c.var.userId;
      const input = await readJson(c, styleInputSchema);
      if ((await styles.count(userId)) >= styleLimits.customStyles) {
        throw new HttpError(
          "bad_request",
          `You can keep at most ${styleLimits.customStyles} custom styles.`,
        );
      }
      const record: StyleRecord = { id: newId(), ...input, createdAt: now().toISOString() };
      await styles.create(userId, record);
      return c.json(present(record), 201);
    })
    .put("/:id", async (c) => {
      const id = editable(c.req.param("id"));
      const input = await readJson(c, styleInputSchema);
      const updated = await styles.update(c.var.userId, id, input);
      if (!updated) throw notFound();
      return c.json(present(updated));
    })
    .delete("/:id", async (c) => {
      const userId = c.var.userId;
      const id = editable(c.req.param("id"));
      if (!(await styles.remove(userId, id))) throw notFound();
      await releaseStyle(userId, id).catch((error: unknown) => {
        log.error("style references not released", {
          userId,
          reason: error instanceof Error ? error.name : "unknown",
        });
      });
      return c.body(null, 204);
    });
}
