import { localeHandler } from "@/lib/handlers.ts";
import { webConfig } from "@/lib/server/config.ts";

export const POST = localeHandler(() => webConfig().webOrigin);
