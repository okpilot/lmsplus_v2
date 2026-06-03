import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'
import { AppShell } from './_components/app-shell'
import { UserProvider } from './_components/user-context'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/')

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('full_name, email, role')
    .eq('id', user.id)
    .single<{ full_name: string | null; email: string; role: string }>()

  if (profileError) {
    // Role is used for UI/nav display only — access control lives in proxy.ts.
    // A failed read degrades gracefully to the 'student' fallback rather than
    // breaking the shell render for a transient DB hiccup.
    console.error('[AppLayout] profile lookup error:', profileError.message)
  }

  const displayName = profile?.full_name ?? profile?.email ?? user.email ?? 'Student'

  const userRole = profile?.role ?? 'student'

  return (
    <UserProvider displayName={displayName} userRole={userRole}>
      <AppShell displayName={displayName} userRole={userRole}>
        {children}
      </AppShell>
    </UserProvider>
  )
}
