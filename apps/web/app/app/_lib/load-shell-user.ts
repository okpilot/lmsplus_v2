import { getCallerProfile } from '@/lib/auth/get-caller-profile'
import type { SessionUser } from '@/lib/auth/verify-session-user'
import type { ShellUser } from './shell-user'

/**
 * Name/role for the app shell. Never rejects and never resolves null: a failure logs and
 * resolves a fallback (session email or 'Student', role 'student'). Role is UI-only — access
 * control lives in the admin layout and requireAdmin().
 */
export async function loadShellUser(user: SessionUser): Promise<ShellUser> {
  const fallback: ShellUser = { displayName: user.email ?? 'Student', userRole: 'student' }
  try {
    const { data: profile, error: profileError } = await getCallerProfile(user.id)
    if (profileError) console.error('[loadShellUser] profile lookup error:', profileError.message)
    if (!profileError && !profile) console.error('[loadShellUser] profile not found:', user.id)

    return {
      displayName: profile?.full_name ?? profile?.email ?? fallback.displayName,
      userRole: profile?.role ?? fallback.userRole,
    }
  } catch (error) {
    console.error('[loadShellUser] read failed:', error instanceof Error ? error.message : error)
    return fallback
  }
}
