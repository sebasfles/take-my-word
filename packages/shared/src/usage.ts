import { z } from "zod";

export const usageSchema = z.object({
  usedSeconds: z.number().nonnegative(),
  capSeconds: z.number().int().positive(),
  resetsAt: z.iso.datetime(),
});
export type Usage = z.infer<typeof usageSchema>;
