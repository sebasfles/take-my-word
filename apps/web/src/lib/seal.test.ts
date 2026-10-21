import { describe, expect, it } from "vitest";
import { testKey } from "../testing/tokens.ts";
import { parseCookieKey, seal, unseal } from "./seal.ts";

describe("seal", () => {
  const key = testKey();

  it("opens what it sealed with the same key and purpose", () => {
    expect(unseal(seal("refresh-token", key, "a"), key, "a")).toBe("refresh-token");
  });

  it("never seals the same value to the same text", () => {
    expect(seal("x", key, "a")).not.toBe(seal("x", key, "a"));
  });

  it("reads a value sealed for another purpose as nothing", () => {
    expect(unseal(seal("x", key, "a"), key, "b")).toBeNull();
  });

  it("reads a value sealed with another key as nothing", () => {
    expect(unseal(seal("x", key, "a"), testKey(), "a")).toBeNull();
  });

  it("reads any flipped byte as nothing", () => {
    const sealed = seal("a longer plaintext value", key, "a");
    const payload = Buffer.from(sealed.slice(3), "base64url");
    for (let index = 0; index < payload.length; index += 1) {
      const tampered = Buffer.from(payload);
      tampered[index] = (tampered[index] ?? 0) ^ 1;
      expect(unseal(`v1.${tampered.toString("base64url")}`, key, "a")).toBeNull();
    }
  });

  it("reads malformed input as nothing", () => {
    for (const value of [undefined, "", "v1.", "v2.abc", "v1.abc.def", "garbage"]) {
      expect(unseal(value, key, "a")).toBeNull();
    }
  });

  it("accepts only a 32-byte key", () => {
    expect(parseCookieKey(key.toString("base64")).equals(key)).toBe(true);
    expect(() => parseCookieKey(Buffer.alloc(16).toString("base64"))).toThrow();
  });
});
