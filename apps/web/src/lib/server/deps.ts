import type { HandlerDeps } from "../handlers.ts";
import { liveAuthDeps, webConfig } from "./config.ts";

export async function liveHandlerDeps(): Promise<HandlerDeps> {
  return { ...(await liveAuthDeps()), webOrigin: webConfig().webOrigin };
}
