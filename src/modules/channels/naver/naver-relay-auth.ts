const encoder = new TextEncoder();

export const NAVER_RELAY_HEADERS = {
  timestamp: "x-shoppingday-timestamp",
  nonce: "x-shoppingday-nonce",
  signature: "x-shoppingday-signature",
} as const;

export type NaverRelaySignatureInput = {
  timestamp: number;
  nonce: string;
  method: string;
  pathAndQuery: string;
  body?: string | Uint8Array | ArrayBuffer;
};

export async function createNaverRelaySignature(
  secret: string,
  input: NaverRelaySignatureInput,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(await canonicalRequest(input)),
  );
  return toBase64Url(new Uint8Array(signature));
}

export async function verifyNaverRelaySignature(
  secret: string,
  input: NaverRelaySignatureInput,
  signature: string,
) {
  let decoded: ArrayBuffer;
  try {
    decoded = fromBase64Url(signature);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    decoded,
    encoder.encode(await canonicalRequest(input)),
  );
}

async function canonicalRequest(input: NaverRelaySignatureInput) {
  const bodyHash = await sha256Hex(input.body ?? "");
  return [
    String(input.timestamp),
    input.nonce,
    input.method.toUpperCase(),
    input.pathAndQuery,
    bodyHash,
  ].join("\n");
}

async function sha256Hex(value: string | Uint8Array | ArrayBuffer) {
  const bytes =
    typeof value === "string"
      ? encoder.encode(value)
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer,
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
  return Uint8Array.from(Buffer.from(value, "base64url")).buffer;
}
