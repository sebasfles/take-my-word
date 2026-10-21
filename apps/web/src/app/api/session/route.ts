import { signInHandler } from "@/lib/handlers.ts";
import { liveHandlerDeps } from "@/lib/server/deps.ts";

export const POST = signInHandler(liveHandlerDeps);
