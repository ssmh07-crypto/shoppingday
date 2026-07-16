import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getServerEnv } from "@/lib/env/server";

declare global {
  interface CloudflareEnv {
    HYPERDRIVE?: { connectionString: string };
  }
}

type SqlClient = ReturnType<typeof postgres>;
export type Database = ReturnType<typeof drizzle>;
type DatabaseSession = { client: SqlClient; database: Database };

let commandSession: DatabaseSession | undefined;

/**
 * Database used only by Node maintenance commands. Worker pages and routes
 * receive a request-scoped Database through withDbSession/withDbReadRecovery.
 */
export function getDb() {
  commandSession ??= createSession();
  return commandSession.database;
}

/** Create and close one database client for a page/API request. */
export async function withDbSession<T>(
  operation: (database: Database) => Promise<T>,
): Promise<T> {
  const session = createSession();
  try {
    return await operation(session.database);
  } finally {
    await session.client.end({ timeout: 1 }).catch(() => undefined);
  }
}

/** Close the shared client used by local maintenance commands. */
export async function closeDb() {
  const current = commandSession;
  commandSession = undefined;
  await current?.client.end({ timeout: 1 });
}

/**
 * Run a read-only request immediately and retry it once with a fresh client on
 * a transient connection failure. There is no mandatory liveness query, so a
 * healthy request does not pay for an extra database round-trip.
 */
export async function withDbReadRecovery<T>(
  operation: (database: Database) => Promise<T>,
): Promise<T> {
  try {
    return await withDbSession(operation);
  } catch (error) {
    if (!isTransientConnectionError(error)) throw error;
    console.warn(
      JSON.stringify({
        event: "database_connection_recycled",
        code: errorCode(error),
      }),
    );
    return withDbSession(operation);
  }
}

function createSession(): DatabaseSession {
  const connection = getDatabaseConnection();
  const client = postgres(connection.url, {
    // Hyperdrive pools origin connections itself. Cloudflare recommends up to
    // five request-local connections so independent reads are not serialized.
    max: connection.hyperdrive ? 5 : 1,
    fetch_types: false,
    prepare: connection.hyperdrive,
    connect_timeout: 6,
    idle_timeout: 10,
    max_lifetime: 60,
  });
  return { client, database: drizzle(client) };
}

function getDatabaseConnection() {
  try {
    const hyperdrive = getCloudflareContext().env.HYPERDRIVE;
    if (hyperdrive?.connectionString) {
      return { url: hyperdrive.connectionString, hyperdrive: true } as const;
    }
  } catch {
    // Node.js admin commands and `next dev` run outside workerd, where the
    // Cloudflare request context is intentionally unavailable.
  }
  return { url: getServerEnv().DATABASE_URL, hyperdrive: false } as const;
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "unknown";
  }
  return String(error.code);
}

function isTransientConnectionError(error: unknown) {
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
