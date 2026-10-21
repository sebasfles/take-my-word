import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const version = "v1";
const ivBytes = 12;
const tagBytes = 16;

export function parseCookieKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("the cookie key must be 32 bytes of base64");
  return key;
}

export function seal(plaintext: string, key: Buffer, purpose: string): string {
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${version}.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url")}`;
}

export function unseal(sealed: string | undefined, key: Buffer, purpose: string): string | null {
  if (sealed === undefined) return null;
  const [prefix, payload, ...rest] = sealed.split(".");
  if (prefix !== version || payload === undefined || rest.length > 0) return null;
  const bytes = Buffer.from(payload, "base64url");
  if (bytes.length < ivBytes + tagBytes) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, ivBytes));
    decipher.setAAD(Buffer.from(purpose, "utf8"));
    decipher.setAuthTag(bytes.subarray(bytes.length - tagBytes));
    const body = bytes.subarray(ivBytes, bytes.length - tagBytes);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
