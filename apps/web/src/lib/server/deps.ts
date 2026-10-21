import { accountApi } from "../api.ts";
import type { DictationHandlerDeps, HandlerDeps } from "../handlers.ts";
import { getCookieKey, liveAuthDeps, webConfig } from "./config.ts";

export async function liveHandlerDeps(): Promise<HandlerDeps> {
  return { ...(await liveAuthDeps()), webOrigin: webConfig().webOrigin };
}

export async function liveDictationDeps(): Promise<DictationHandlerDeps> {
  const { apiUrl, webOrigin } = webConfig();
  return {
    key: await getCookieKey(),
    now: () => Date.now(),
    webOrigin,
    api: (accessToken) => accountApi(apiUrl, accessToken),
  };
}
