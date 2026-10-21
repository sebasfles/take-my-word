import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { describe, expect, it } from "vitest";
import { createLogger } from "../lib/log.ts";
import { createAuthorizer } from "./authorize.ts";

const userPoolId = "us-east-1_TestPool";
const clientId = "native-client";
const issuer = `https://cognito-idp.us-east-1.amazonaws.com/${userPoolId}`;

function keyPair(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  return {
    kid,
    privateKey,
    jwk: { kty: "RSA", n: jwk.n ?? "", e: jwk.e ?? "", kid, alg: "RS256", use: "sig" },
  };
}

const trusted = keyPair("trusted");
const impostor = keyPair("trusted");

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(
  claims: Record<string, unknown>,
  key: { kid: string; privateKey: KeyObject } = trusted,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: "RS256", kid: key.kid, typ: "JWT" });
  const payload = base64url({
    sub: "user-sub-1",
    iss: issuer,
    client_id: clientId,
    token_use: "access",
    scope: "aws.cognito.signin.user.admin",
    iat: now - 10,
    exp: now + 3600,
    ...claims,
  });
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(key.privateKey, "base64url");
  return `${header}.${payload}.${signature}`;
}

const verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "access" });
verifier.cacheJwks({ keys: [trusted.jwk] });

const lines: string[] = [];
const authorize = createAuthorizer(
  { verify: (token) => verifier.verify(token) },
  createLogger({}, (line) => lines.push(line)),
);

const request = (authorization?: string) =>
  authorize({ headers: authorization === undefined ? {} : { authorization } });

describe("authorizer", () => {
  it("allows a valid access token and passes its sub as the user id", async () => {
    expect(await request(`Bearer ${sign({})}`)).toEqual({
      isAuthorized: true,
      context: { userId: "user-sub-1" },
    });
  });

  it("accepts the scheme in any case", async () => {
    expect((await request(`bearer ${sign({})}`)).isAuthorized).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["a token without the Bearer scheme", sign({})],
    ["an empty bearer", "Bearer "],
    ["garbage", "Bearer not-a-jwt"],
    ["an expired token", `Bearer ${sign({ exp: Math.floor(Date.now() / 1000) - 60 })}`],
    ["an id token", `Bearer ${sign({ token_use: "id" })}`],
    ["another app client", `Bearer ${sign({ client_id: "web-client" })}`],
    [
      "another user pool",
      `Bearer ${sign({ iss: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Other" })}`,
    ],
    ["a token signed by another key under the same kid", `Bearer ${sign({}, impostor)}`],
  ])("denies %s", async (_, authorization) => {
    expect(await request(authorization)).toEqual({ isAuthorized: false });
  });

  it("never logs the token", async () => {
    const token = sign({ client_id: "web-client" });
    await request(`Bearer ${token}`);
    expect(lines.join("\n")).not.toContain(token.split(".")[2]);
  });
});
