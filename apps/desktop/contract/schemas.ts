import {
  apiErrorSchema,
  appRuleListSchema,
  dictationMetaSchema,
  dictationResponseSchema,
  discoverySchema,
  earlierSegmentsSchema,
  segmentMetaSchema,
  segmentResponseSchema,
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
    segmentMeta: z.toJSONSchema(segmentMetaSchema, { io: "input" }),
    segmentResponse: z.toJSONSchema(segmentResponseSchema),
    earlierSegments: z.toJSONSchema(earlierSegmentsSchema),
    apiError: z.toJSONSchema(apiErrorSchema),
    settings: z.toJSONSchema(settingsSchema),
    styleList: z.toJSONSchema(styleListSchema),
    appRuleList: z.toJSONSchema(appRuleListSchema),
    discovery: z.toJSONSchema(discoverySchema),
  };
}
