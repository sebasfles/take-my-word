import type { Usage } from "@take-my-word/shared";
import { Hono } from "hono";
import type { ApiEnv } from "../api/context.ts";
import { quotaWindow } from "../dictation/quota.ts";
import type { UsageStore } from "./store.ts";

export interface UsageRoutesDeps {
  usage: UsageStore;
  dailyQuotaMinutes: number;
  now: () => Date;
}

export function usageRoutes({ usage, dailyQuotaMinutes, now }: UsageRoutesDeps) {
  return new Hono<ApiEnv>().get("/", async (c) => {
    const window = quotaWindow(now());
    const body: Usage = {
      usedSeconds: await usage.usedSeconds(c.var.userId, window.day),
      capSeconds: dailyQuotaMinutes * 60,
      resetsAt: window.resetsAt,
    };
    return c.json(body);
  });
}
