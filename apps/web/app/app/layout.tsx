import { redirect } from 'next/navigation'
import { LookScope } from '@/components/kit/look-scope'
import { getCallerProfile } from '@/lib/auth/get-caller-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { AppShell } from './_components/app-shell'
import { UserProvider } from './_components/user-context'

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser()

  if (!user) redirect('/')

  const { data: profile, error: profileError } = await getCallerProfile(user.id)

  if (profileError) {
    // Role is used for UI/nav display only — access control lives in the admin layout and requireAdmin().
    // A failed read degrades gracefully to the 'student' fallback rather than
    // breaking the shell render for a transient DB hiccup.
    console.error('[AppLayout] profile lookup error:', profileError.message)
  }

  if (!profileError && !profile) console.error('[AppLayout] profile not found:', user.id)

  const displayName = profile?.full_name ?? profile?.email ?? user.email ?? 'Student'

  const userRole = profile?.role ?? 'student'

  return (
    <UserProvider displayName={displayName} userRole={userRole}>
      <LookScope>
        <AppShell displayName={displayName} userRole={userRole}>
          {children}
        </AppShell>
      </LookScope>
    </UserProvider>
  )
}
