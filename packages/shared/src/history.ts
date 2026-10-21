import { z } from "zod";
import { styleIdSchema } from "./styles.ts";

export const historyLimits = { defaultPageSize: 20, maxPageSize: 100 } as const;

export const historyQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(historyLimits.maxPageSize)
    .default(historyLimits.defaultPageSize),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

export const historyItemSchema = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  locale: z.string(),
  text: z.string(),
  raw: z.string(),
  styleId: styleIdSchema.optional(),
  audioSeconds: z.number().nonnegative(),
});
export type HistoryItem = z.infer<typeof historyItemSchema>;

export const historyPageSchema = z.object({
  items: z.array(historyItemSchema),
  cursor: z.string().optional(),
});
export type HistoryPage = z.infer<typeof historyPageSchema>;
