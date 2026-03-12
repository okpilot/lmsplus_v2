import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'
import { AppShell } from './_components/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email, role')
    .eq('id', user.id)
    .single<{ full_name: string | null; email: string; role: string }>()

  const displayName = profile?.full_name ?? profile?.email ?? user.email ?? 'Student'

  return <AppShell displayName={displayName}>{children}</AppShell>
}
