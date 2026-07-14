import 'server-only'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getDb } from '@/lib/db'
import { userProfiles } from '@/lib/db/schema'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export class AuthenticationError extends Error {
  readonly code = 'authentication_error'
}

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new AuthenticationError('관리자 로그인이 필요합니다.')

  const [profile] = await getDb()
    .select({ role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.userId, data.user.id))
    .limit(1)

  if (profile?.role !== 'admin') throw new AuthenticationError('관리자 권한이 필요합니다.')
  return data.user
}

export async function requireAdminPage() {
  try {
    return await requireAdmin()
  } catch {
    redirect('/login')
  }
}
