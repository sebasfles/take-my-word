import { apiErrorStatus, type ApiError, type ApiErrorCode } from "@take-my-word/shared";
import { Hono } from "hono";
import { routePath } from "hono/route";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { appRuleRoutes } from "../app-rules/routes.ts";
import type { AppRuleStore } from "../app-rules/store.ts";
import { dictionaryRoutes } from "../dictionary/routes.ts";
import type { DictionaryStore } from "../dictionary/store.ts";
import { historyRoutes } from "../history/routes.ts";
import type { HistoryStore } from "../history/store.ts";
import { HttpError } from "../lib/http-error.ts";
import type { Logger } from "../lib/log.ts";
import { settingsRoutes } from "../settings/routes.ts";
import type { SettingsStore } from "../settings/store.ts";
import { styleRoutes } from "../styles/routes.ts";
import type { StyleStore } from "../styles/store.ts";
import { usageRoutes } from "../usage/routes.ts";
import type { UsageStore } from "../usage/store.ts";
import type { ApiContext, ApiEnv } from "./context.ts";

export interface ApiDeps {
  dictionary: DictionaryStore;
  styles: StyleStore;
  appRules: AppRuleStore;
  settings: SettingsStore;
  history: HistoryStore;
  usage: UsageStore;
  dailyQuotaMinutes: number;
  newId: () => string;
  now: () => Date;
  log: Logger;
}

function failure(c: ApiContext, code: ApiErrorCode, message: string) {
  const body: ApiError = { error: { code, message } };
  return c.json(body, apiErrorStatus[code] as ContentfulStatusCode);
}

export function createApi(deps: ApiDeps) {
  return new Hono<ApiEnv>()
    .use(async (c, next) => {
      const userId = c.env.event?.requestContext?.authorizer?.lambda?.userId;
      if (!userId) throw new HttpError("unauthorized", "Sign in first.");
      c.set("userId", userId);
      await next();
    })
    .route("/dictionary", dictionaryRoutes(deps))
    .route("/styles", styleRoutes(deps))
    .route("/app-rules", appRuleRoutes(deps))
    .route("/me/settings", settingsRoutes(deps))
    .route("/me/usage", usageRoutes(deps))
    .route("/dictations", historyRoutes(deps))
    .notFound((c) => failure(c, "not_found", "No such route."))
    .onError((error, c) => {
      const log = deps.log.child({
        requestId: c.env.lambdaContext?.awsRequestId,
        userId: c.get("userId"),
        route: `${c.req.method} ${routePath(c, -1)}`,
      });
      if (error instanceof HttpError) {
        log.info("request rejected", { code: error.code });
        return failure(c, error.code, error.message);
      }
      log.error("request failed", { error: error.name });
      return failure(c, "internal", "Something went wrong; try again.");
    });
}
