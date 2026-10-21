import { HttpError } from "./http-error.ts";

export function encodePathId(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

export function decodePathId(id: string): string | undefined {
  if (!/^[\w-]+$/.test(id)) return undefined;
  const key = Buffer.from(id, "base64url").toString("utf8");
  return encodePathId(key) === id ? key : undefined;
}

export function keyFromPathId(id: string, isCanonical: (key: string) => boolean): string {
  const key = decodePathId(id);
  if (key === undefined || key === "" || !isCanonical(key)) {
    throw new HttpError("bad_request", "Malformed id.");
  }
  return key;
}
