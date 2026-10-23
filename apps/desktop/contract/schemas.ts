import {
  apiErrorSchema,
  appRuleListSchema,
  dictationMetaSchema,
  dictationResponseSchema,
  discoverySchema,
  settingsSchema,
  styleListSchema,
} from "@take-my-word/shared";
import { join } from "node:path";
import { z } from "zod";

export const contractPath = join(import.meta.dirname, "../src-tauri/src/api/contract.schema.json");

export function contractSchemas(): Record<string, unknown> {
  return {
    dictationMeta: z.toJSONSchema(dictationMetaSchema, { io: "input" }),
    dictationResponse: z.toJSONSchema(dictationResponseSchema),
    apiError: z.toJSONSchema(apiErrorSchema),
    settings: z.toJSONSchema(settingsSchema),
    styleList: z.toJSONSchema(styleListSchema),
    appRuleList: z.toJSONSchema(appRuleListSchema),
    discovery: z.toJSONSchema(discoverySchema),
  };
}
