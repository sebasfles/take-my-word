import { z } from "zod";
import { styleIdSchema } from "./styles.ts";

export const pasteKeystrokes = ["ctrl+v", "ctrl+shift+v", "shift+insert", "cmd+v"] as const;
export type PasteKeystroke = (typeof pasteKeystrokes)[number];

export const appRuleLimits = { rules: 100 } as const;

export const appIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .transform((appId) => appId.toLowerCase());

export const appRuleUpdateSchema = z.object({
  styleId: styleIdSchema.optional(),
  keystroke: z.enum(pasteKeystrokes),
});
export type AppRuleUpdate = z.infer<typeof appRuleUpdateSchema>;

export const appRuleInputSchema = appRuleUpdateSchema.extend({ appId: appIdSchema });
export type AppRuleInput = z.infer<typeof appRuleInputSchema>;

export const appRuleSchema = z.object({
  id: z.string(),
  appId: z.string(),
  styleId: styleIdSchema.optional(),
  keystroke: z.enum(pasteKeystrokes),
});
export type AppRule = z.infer<typeof appRuleSchema>;

export const appRuleListSchema = z.object({ rules: z.array(appRuleSchema) });
export type AppRuleList = z.infer<typeof appRuleListSchema>;
