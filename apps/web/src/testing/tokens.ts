import { randomBytes } from "node:crypto";

export function fakeAccessToken(claims: { username: string; exp: number }): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", kid: "test" })}.${encode({ ...claims, token_use: "access" })}.${randomBytes(32).toString("base64url")}`;
}

export function testKey(): Buffer {
  return randomBytes(32);
}
