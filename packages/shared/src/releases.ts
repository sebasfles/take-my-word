import { z } from "zod";

export const desktopReleaseManifestSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
});
export type DesktopReleaseManifest = z.infer<typeof desktopReleaseManifestSchema>;
