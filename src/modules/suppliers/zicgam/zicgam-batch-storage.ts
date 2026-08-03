import "server-only";
import { getServerEnv } from "@/lib/env/server";

export const ZICGAM_IMPORT_BUCKET = "zicgam-imports";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isZicgamJobId(value: string) {
  return UUID_PATTERN.test(value);
}

export function zicgamChunkPath(jobId: string, index: number) {
  return `${jobId}/${String(index).padStart(5, "0")}.json.gz`;
}

export async function createZicgamUploadToken(jobId: string) {
  const secret = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("zicgam_storage_not_configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(jobId)),
  );
  return bytesToBase64Url(signature);
}

export async function verifyZicgamUploadToken(jobId: string, token: string) {
  const secret = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !token) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(token),
    new TextEncoder().encode(jobId),
  );
}

export async function createZicgamSignedUpload(jobId: string, index: number) {
  const env = getServerEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("zicgam_storage_not_configured");
  }
  const path = zicgamChunkPath(jobId, index)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const response = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${ZICGAM_IMPORT_BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
        "x-upsert": "true",
      },
      body: "{}",
    },
  );
  if (!response.ok) {
    throw new Error(`zicgam_signed_upload_failed:${response.status}`);
  }
  const result = (await response.json()) as { url?: string };
  if (!result.url) throw new Error("zicgam_signed_upload_url_missing");
  return {
    signedUrl: `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1${result.url}`,
    apiKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    path: zicgamChunkPath(jobId, index),
  };
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}
