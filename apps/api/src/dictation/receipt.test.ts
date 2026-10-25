import { describe, expect, it } from "vitest";
import { issueReceipt, verifyReceipt } from "./receipt.ts";

const key = { secret: "k".repeat(32), maxAgeSeconds: 300 };
const issuedAt = 1_800_000_000;
const claims = { seconds: 10.24, language: "es" as const, issuedAt };
const receipt = issueReceipt(key.secret, "user-1", "hola mundo", claims);

describe("segment receipts", () => {
  it("verify for the same user and text within their age", () => {
    expect(verifyReceipt(key, "user-1", "hola mundo", receipt, issuedAt + 120)).toEqual(claims);
  });

  it("refuse another user, so a receipt cannot be replayed across accounts", () => {
    expect(verifyReceipt(key, "user-2", "hola mundo", receipt, issuedAt)).toBeUndefined();
  });

  it("refuse a changed text", () => {
    expect(verifyReceipt(key, "user-1", "hola mundo.", receipt, issuedAt)).toBeUndefined();
  });

  it("refuse claims rewritten by the client, even re-encoded", () => {
    const [, mac] = receipt.split(".");
    const forged = Buffer.from(JSON.stringify({ s: 0, l: "es", t: issuedAt })).toString(
      "base64url",
    );
    expect(
      verifyReceipt(key, "user-1", "hola mundo", `${forged}.${mac}`, issuedAt),
    ).toBeUndefined();
  });

  it("refuse a receipt signed with another environment's key", () => {
    const other = issueReceipt("o".repeat(32), "user-1", "hola mundo", claims);
    expect(verifyReceipt(key, "user-1", "hola mundo", other, issuedAt)).toBeUndefined();
  });

  it("expire after their maximum age and refuse one issued in the future", () => {
    expect(verifyReceipt(key, "user-1", "hola mundo", receipt, issuedAt + 300)).toEqual(claims);
    expect(verifyReceipt(key, "user-1", "hola mundo", receipt, issuedAt + 301)).toBeUndefined();
    expect(verifyReceipt(key, "user-1", "hola mundo", receipt, issuedAt - 61)).toBeUndefined();
  });

  it.each(["", "abc", "a.b.c", ".", `${receipt}x`])("refuse the malformed %j", (malformed) => {
    expect(verifyReceipt(key, "user-1", "hola mundo", malformed, issuedAt)).toBeUndefined();
  });
});
