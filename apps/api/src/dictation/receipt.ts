import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { languageSchema, type Language } from "@take-my-word/shared";
import { z } from "zod";

export interface ReceiptClaims {
  seconds: number;
  language: Language;
  issuedAt: number;
}

export interface ReceiptKey {
  secret: string;
  maxAgeSeconds: number;
}

export const receiptMaxAgeSeconds = 180;
const clockSkewSeconds = 60;

const claimsSchema = z.object({
  s: z.number().nonnegative(),
  l: languageSchema,
  t: z.number().int().nonnegative(),
});

function signature(secret: string, userId: string, text: string, payload: string): Buffer {
  const textHash = createHash("sha256").update(text, "utf8").digest("hex");
  return createHmac("sha256", secret)
    .update(`v1\n${userId}\n${textHash}\n${payload}`, "utf8")
    .digest();
}

export function issueReceipt(
  secret: string,
  userId: string,
  text: string,
  { seconds, language, issuedAt }: ReceiptClaims,
): string {
  const payload = Buffer.from(
    JSON.stringify({ s: seconds, l: language, t: issuedAt }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${signature(secret, userId, text, payload).toString("base64url")}`;
}

export function verifyReceipt(
  key: ReceiptKey,
  userId: string,
  text: string,
  receipt: string,
  nowSeconds: number,
): ReceiptClaims | undefined {
  const [payload, mac, ...rest] = receipt.split(".");
  if (payload === undefined || mac === undefined || rest.length > 0) return undefined;
  const expected = signature(key.secret, userId, text, payload);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  const claims = claimsSchema.safeParse(json);
  if (!claims.success) return undefined;
  const { s: seconds, l: language, t: issuedAt } = claims.data;
  if (issuedAt > nowSeconds + clockSkewSeconds) return undefined;
  if (nowSeconds - issuedAt > key.maxAgeSeconds) return undefined;
  return { seconds, language, issuedAt };
}
