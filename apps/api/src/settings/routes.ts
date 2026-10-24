import { localeFor, settingsUpdateSchema, type Settings } from "@take-my-word/shared";
import { Hono } from "hono";
import { readJson, type ApiEnv } from "../api/context.ts";
import { requireStyle } from "../styles/exists.ts";
import type { StyleStore } from "../styles/store.ts";
import { defaultSettings } from "./defaults.ts";
import type { SettingsStore } from "./store.ts";

export const releasedDesktopProviders = { transcriber: "groq-whisper", refiner: "openai" } as const;

export interface SettingsRoutesDeps {
  settings: SettingsStore;
  styles: StyleStore;
}

export function settingsRoutes({ settings, styles }: SettingsRoutesDeps) {
  return new Hono<ApiEnv>()
    .get("/", async (c) => {
      const userId = c.var.userId;
      const body: Settings =
        (await settings.get(userId)) ?? (await settings.create(userId, defaultSettings));
      return c.json({ ...body, providers: releasedDesktopProviders });
    })
    .put("/", async (c) => {
      const userId = c.var.userId;
      const input = await readJson(c, settingsUpdateSchema);
      await requireStyle(styles, userId, input.defaultStyleId);
      const current = (await settings.get(userId)) ?? defaultSettings;
      const dictationLanguages = input.dictationLanguages ?? current.dictationLanguages;
      const next: Settings = {
        defaultStyleId: input.defaultStyleId,
        locale: localeFor(dictationLanguages, current.locale),
        dictationLanguages,
        context: input.context ?? current.context,
      };
      await settings.put(userId, next);
      return c.json({ ...next, providers: releasedDesktopProviders });
    });
}
