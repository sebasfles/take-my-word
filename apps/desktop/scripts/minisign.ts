import { createHash, createPublicKey, verify } from "node:crypto";

export interface SignedFields {
  file: string | undefined;
  version: string | undefined;
}

function decodeBase64Text(value: string): string[] {
  return Buffer.from(value.trim(), "base64").toString("utf8").trim().split(/\r?\n/);
}

function line(lines: string[], index: number, what: string): string {
  const value = lines[index];
  if (value === undefined) throw new Error(`the ${what} is incomplete`);
  return value;
}

function ed25519Key(raw: Buffer) {
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") },
    format: "jwk",
  });
}

export function verifyUpdaterSignature(
  publicKey: string,
  signature: string,
  data: Uint8Array,
): SignedFields {
  const key = Buffer.from(line(decodeBase64Text(publicKey), 1, "public key"), "base64");
  if (key.length !== 42 || key.subarray(0, 2).toString("latin1") !== "Ed") {
    throw new Error("the public key is not a minisign Ed25519 key");
  }
  const sigLines = decodeBase64Text(signature);
  const sig = Buffer.from(line(sigLines, 1, "signature"), "base64");
  const trustedLine = line(sigLines, 2, "signature");
  const globalSig = Buffer.from(line(sigLines, 3, "signature"), "base64");
  const algorithm = sig.subarray(0, 2).toString("latin1");
  if (sig.length !== 74 || (algorithm !== "ED" && algorithm !== "Ed")) {
    throw new Error("the signature is not a minisign Ed25519 signature");
  }
  if (!sig.subarray(2, 10).equals(key.subarray(2, 10))) {
    throw new Error("the signature was made with another key");
  }
  const publicKeyObject = ed25519Key(key.subarray(10));
  const message = algorithm === "ED" ? createHash("blake2b512").update(data).digest() : data;
  if (!verify(null, message, publicKeyObject, sig.subarray(10))) {
    throw new Error("the signature does not match the file");
  }
  const prefix = "trusted comment: ";
  if (!trustedLine.startsWith(prefix)) throw new Error("the signature has no trusted comment");
  const trusted = trustedLine.slice(prefix.length);
  const covered = Buffer.concat([sig.subarray(10), Buffer.from(trusted, "utf8")]);
  if (!verify(null, covered, publicKeyObject, globalSig)) {
    throw new Error("the trusted comment does not match its signature");
  }
  const fields = new Map(
    trusted.split("\t").map((field) => {
      const at = field.indexOf(":");
      return [field.slice(0, at), field.slice(at + 1)] as const;
    }),
  );
  return { file: fields.get("file"), version: fields.get("version") };
}
