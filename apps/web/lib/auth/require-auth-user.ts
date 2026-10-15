import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/get-session-user'
import type { SessionUser } from '@/lib/auth/verify-session-user'

/**
 * Require an authenticated user in a Server Component or Server Action.
 * Redirects to `/` (the login page) if the session is missing or invalid.
 */
export async function requireAuthUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/')
  return user
}
