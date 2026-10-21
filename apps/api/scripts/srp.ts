import { createHash, createHmac, randomBytes } from "node:crypto";

const N = BigInt(
  "0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF",
);
const g = 2n;

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = ((base % modulus) + modulus) % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

function padHex(value: bigint): string {
  const hex = value.toString(16);
  const even = hex.length % 2 === 0 ? hex : `0${hex}`;
  return /^[89a-f]/i.test(even) ? `00${even}` : even;
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex").padStart(64, "0");
}

function hexHash(hex: string): string {
  return sha256Hex(Buffer.from(hex, "hex"));
}

const k = BigInt(`0x${hexHash(`${padHex(N)}${padHex(g)}`)}`);

export function srpStart(): { a: bigint; A: string } {
  for (;;) {
    const a = BigInt(`0x${randomBytes(128).toString("hex")}`) % N;
    const A = modPow(g, a, N);
    if (A % N !== 0n) return { a, A: A.toString(16) };
  }
}

function cognitoTimestamp(now: Date): string {
  const day = now.toLocaleString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = now.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  return `${day} ${month} ${now.getUTCDate()} ${time} UTC ${now.getUTCFullYear()}`;
}

export function passwordVerifier(input: {
  userPoolId: string;
  userIdForSrp: string;
  password: string;
  a: bigint;
  A: string;
  srpB: string;
  salt: string;
  secretBlock: string;
  now: Date;
}): { signature: string; timestamp: string } {
  const poolName = input.userPoolId.split("_")[1] ?? "";
  const B = BigInt(`0x${input.srpB}`);
  if (B % N === 0n) throw new Error("invalid SRP_B");
  const A = BigInt(`0x${input.A}`);
  const u = BigInt(`0x${hexHash(`${padHex(A)}${padHex(B)}`)}`);
  if (u === 0n) throw new Error("invalid SRP u");
  const identity = sha256Hex(`${poolName}${input.userIdForSrp}:${input.password}`);
  const x = BigInt(`0x${hexHash(`${padHex(BigInt(`0x${input.salt}`))}${identity}`)}`);
  const S = modPow(B - k * modPow(g, x, N), input.a + u * x, N);

  const prk = createHmac("sha256", Buffer.from(padHex(u), "hex"))
    .update(Buffer.from(padHex(S), "hex"))
    .digest();
  const key = createHmac("sha256", prk)
    .update(Buffer.concat([Buffer.from("Caldera Derived Key", "utf8"), Buffer.from([1])]))
    .digest()
    .subarray(0, 16);

  const timestamp = cognitoTimestamp(input.now);
  const signature = createHmac("sha256", key)
    .update(
      Buffer.concat([
        Buffer.from(poolName, "utf8"),
        Buffer.from(input.userIdForSrp, "utf8"),
        Buffer.from(input.secretBlock, "base64"),
        Buffer.from(timestamp, "utf8"),
      ]),
    )
    .digest("base64");
  return { signature, timestamp };
}

export function deviceVerifier(input: { deviceGroupKey: string; deviceKey: string }): {
  password: string;
  passwordVerifier: string;
  salt: string;
} {
  const password = randomBytes(40).toString("base64");
  const salt = BigInt(`0x${randomBytes(16).toString("hex")}`);
  const identity = sha256Hex(`${input.deviceGroupKey}${input.deviceKey}:${password}`);
  const x = BigInt(`0x${hexHash(`${padHex(salt)}${identity}`)}`);
  const verifier = modPow(g, x, N);
  return {
    password,
    passwordVerifier: Buffer.from(padHex(verifier), "hex").toString("base64"),
    salt: Buffer.from(padHex(salt), "hex").toString("base64"),
  };
}
