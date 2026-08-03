import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type Database } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AUTHENTICATED_USER_HEADER } from "./trusted-request";

export class AuthenticationError extends Error {
  readonly code = "authentication_error";
}

export async function requireAdmin(database: Database = getDb()) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId)
    throw new AuthenticationError("관리자 로그인이 필요합니다.");

  return requireAdminProfile(String(userId), database);
}

async function requireAdminProfile(userId: string, database: Database) {
  const [profile] = await database
    .select({ role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (profile?.role !== "admin")
    throw new AuthenticationError("관리자 권한이 필요합니다.");
  return { id: userId };
}

export async function requireAdminPage(database: Database = getDb()) {
  try {
    const userId = (await headers()).get(AUTHENTICATED_USER_HEADER);
    if (!userId) throw new AuthenticationError("Authentication required");
    return await requireAdminProfile(userId, database);
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/login");
    throw error;
  }
}
