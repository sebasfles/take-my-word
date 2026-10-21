import { HttpError } from "../lib/http-error.ts";
import { isBuiltinStyle } from "./builtin/index.ts";
import type { StyleStore } from "./store.ts";

export async function requireStyle(styles: StyleStore, userId: string, styleId: string) {
  if (isBuiltinStyle(styleId) || (await styles.get(userId, styleId))) return;
  throw new HttpError("bad_request", `There is no style ${styleId}.`);
}
