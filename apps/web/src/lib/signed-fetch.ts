const contentHashHeader = "x-amz-content-sha256";
const encoder = new TextEncoder();

export async function signedFetch(
  input: string,
  init: RequestInit = {},
  origin: string = window.location.origin,
): Promise<Response> {
  if (new URL(input, origin).origin !== origin) return fetch(input, init);

  const headers = new Headers(init.headers);
  headers.set(contentHashHeader, await payloadHash(init.body));

  return fetch(input, { ...init, headers });
}

export async function payloadHash(body: RequestInit["body"]): Promise<string> {
  if (body === undefined || body === null) return hex(await sha256(""));
  if (typeof body !== "string") {
    throw new Error("signedFetch can only hash a string or absent body");
  }

  return hex(await sha256(body));
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
