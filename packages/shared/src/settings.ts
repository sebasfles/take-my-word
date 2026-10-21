import { z } from "zod";
import { localeSchema, refinerIds, transcriberIds } from "./dictations.ts";
import { styleIdSchema } from "./styles.ts";

export const settingsSchema = z.object({
  defaultStyleId: styleIdSchema,
  locale: localeSchema,
  providers: z.object({
    transcriber: z.enum(transcriberIds),
    refiner: z.enum(refinerIds),
  }),
});
export type Settings = z.infer<typeof settingsSchema>;
