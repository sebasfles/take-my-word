import { themeHandler } from "@/lib/handlers.ts";
import { webConfig } from "@/lib/server/config.ts";

export const POST = themeHandler(() => webConfig().webOrigin);
