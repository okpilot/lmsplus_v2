import { getCallerProfile } from '@/lib/auth/get-caller-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'

export type ShellUser = { displayName: string; userRole: string }

/**
 * Name/role for the app shell. Never rejects: any failure logs and resolves null so the
 * leaves render generic text. Role is UI-only — access control lives in the admin layout
 * and requireAdmin().
 */
export async function loadShellUser(): Promise<ShellUser | null> {
  try {
    const user = await getSessionUser()
    if (!user) return null

    const { data: profile, error: profileError } = await getCallerProfile(user.id)
    if (profileError) console.error('[AppLayout] profile lookup error:', profileError.message)
    if (!profileError && !profile) console.error('[AppLayout] profile not found:', user.id)

    return {
      displayName: profile?.full_name ?? profile?.email ?? user.email ?? 'Student',
      userRole: profile?.role ?? 'student',
    }
  } catch (error) {
    console.error('[loadShellUser] read failed:', error instanceof Error ? error.message : error)
    return null
  }
}
