import "server-only";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getServerEnv } from "@/lib/env/server";

declare global {
  interface CloudflareEnv {
    HYPERDRIVE?: { connectionString: string };
  }
}

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  if (!database) {
    client = postgres(getDatabaseUrl(), {
      prepare: false,
      // A Worker isolate can be frozen between requests. Keep a single socket
      // so concurrent isolates cannot exhaust the Supabase pooler.
      max: 1,
      connect_timeout: 6,
      idle_timeout: 10,
      max_lifetime: 60,
    });
    database = drizzle(client);
  }
  return database;
}

function getDatabaseUrl() {
  try {
    const hyperdrive = getCloudflareContext().env.HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    // Node.js admin commands and `next dev` run outside workerd, where the
    // Cloudflare request context is intentionally unavailable.
  }
  return getServerEnv().DATABASE_URL;
}

export async function closeDb() {
  const current = client;
  client = undefined;
  database = undefined;
  await current?.end({ timeout: 1 });
}

/**
 * Serverless runtimes can resume with a socket that the pooler has already
 * discarded. Check liveness before read-only work and retry once with a new
 * client. The operation must not perform writes.
 */
export async function withDbReadRecovery<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    await assertDbAlive();
    return await operation();
  } catch (error) {
    if (!isTransientConnectionError(error)) throw error;
    console.warn(
      JSON.stringify({
        event: "database_connection_recycled",
        code: errorCode(error),
      }),
    );
    await closeDb().catch(() => undefined);
    await assertDbAlive();
    return operation();
  }
}

async function assertDbAlive() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new DatabaseLivenessError()), 3_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

class DatabaseLivenessError extends Error {
  readonly code = "DB_LIVENESS_TIMEOUT";
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error))
    return "unknown";
  return String(error.code);
}

function isTransientConnectionError(error: unknown) {
  if (error instanceof DatabaseLivenessError) return true;
  const code = errorCode(error);
  return (
    code.startsWith("08") ||
    [
      "CONNECT_TIMEOUT",
      "CONNECTION_CLOSED",
      "ECONNRESET",
      "ECONNREFUSED",
      "EPIPE",
      "ETIMEDOUT",
      "57P01",
      "57P02",
      "57P03",
    ].includes(code)
  );
}
