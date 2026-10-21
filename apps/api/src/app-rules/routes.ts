import {
  appIdSchema,
  appRuleInputSchema,
  appRuleLimits,
  appRuleUpdateSchema,
  type AppRule,
  type AppRuleList,
} from "@take-my-word/shared";
import { Hono } from "hono";
import { readJson, type ApiEnv } from "../api/context.ts";
import { HttpError } from "../lib/http-error.ts";
import { encodePathId, keyFromPathId } from "../lib/path-id.ts";
import { requireStyle } from "../styles/exists.ts";
import type { StyleStore } from "../styles/store.ts";
import type { AppRuleRecord, AppRuleStore } from "./store.ts";

export interface AppRuleRoutesDeps {
  appRules: AppRuleStore;
  styles: StyleStore;
}

function appIdOf(id: string): string {
  return keyFromPathId(id, (appId) => appIdSchema.safeParse(appId).data === appId);
}

function present(rule: AppRuleRecord): AppRule {
  return { id: encodePathId(rule.appId), ...rule };
}

const notFound = () => new HttpError("not_found", "There is no rule for that app.");

export function appRuleRoutes({ appRules, styles }: AppRuleRoutesDeps) {
  return new Hono<ApiEnv>()
    .get("/", async (c) => {
      const rules = await appRules.list(c.var.userId);
      rules.sort((a, b) => a.appId.localeCompare(b.appId));
      const body: AppRuleList = { rules: rules.map(present) };
      return c.json(body);
    })
    .post("/", async (c) => {
      const userId = c.var.userId;
      const input = await readJson(c, appRuleInputSchema);
      if (input.styleId !== undefined) await requireStyle(styles, userId, input.styleId);
      if ((await appRules.count(userId)) >= appRuleLimits.rules) {
        throw new HttpError(
          "bad_request",
          `You can keep at most ${appRuleLimits.rules} app rules.`,
        );
      }
      const rule: AppRuleRecord = {
        appId: input.appId,
        ...(input.styleId !== undefined && { styleId: input.styleId }),
        keystroke: input.keystroke,
      };
      if (!(await appRules.create(userId, rule))) {
        throw new HttpError("conflict", "That app already has a rule.");
      }
      return c.json(present(rule), 201);
    })
    .put("/:id", async (c) => {
      const userId = c.var.userId;
      const appId = appIdOf(c.req.param("id"));
      const update = await readJson(c, appRuleUpdateSchema);
      if (update.styleId !== undefined) await requireStyle(styles, userId, update.styleId);
      const updated = await appRules.update(userId, appId, update);
      if (!updated) throw notFound();
      return c.json(present(updated));
    })
    .delete("/:id", async (c) => {
      if (!(await appRules.remove(c.var.userId, appIdOf(c.req.param("id"))))) {
        throw notFound();
      }
      return c.body(null, 204);
    });
}
