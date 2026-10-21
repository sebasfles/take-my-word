import { z } from "zod";

export const builtinStyleIds = ["plain", "casual", "formal"] as const;
export type BuiltinStyleId = (typeof builtinStyleIds)[number];
export const fallbackStyleId: BuiltinStyleId = "plain";

export const styleLimits = { customStyles: 20, nameLength: 40, promptLength: 2000 } as const;

export const styleIdSchema = z.string().min(1).max(64);

export const styleInputSchema = z.object({
  name: z.string().trim().min(1).max(styleLimits.nameLength),
  prompt: z.string().trim().min(1).max(styleLimits.promptLength),
});
export type StyleInput = z.infer<typeof styleInputSchema>;

export const styleSchema = z.object({
  id: styleIdSchema,
  name: z.string(),
  prompt: z.string(),
  builtin: z.boolean(),
});
export type Style = z.infer<typeof styleSchema>;

export const styleListSchema = z.object({ styles: z.array(styleSchema) });
export type StyleList = z.infer<typeof styleListSchema>;
