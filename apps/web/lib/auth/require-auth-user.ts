import { redirect } from 'next/navigation'
import { getSessionUser, type SessionUser } from '@/lib/auth/get-session-user'

/**
 * Require an authenticated user in a Server Component.
 * Redirects to `/` (the login page) if the session is missing or invalid.
 */
export async function requireAuthUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/')
  return user
}
