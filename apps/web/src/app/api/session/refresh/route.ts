import { refreshHandler } from "@/lib/handlers.ts";
import { liveHandlerDeps } from "@/lib/server/deps.ts";

export const POST = refreshHandler(liveHandlerDeps);
