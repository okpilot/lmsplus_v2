import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'
import { SignOutButton } from './_components/sign-out-button'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware should catch this, but double-check server-side
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email, role')
    .eq('id', user.id)
    .single<{ full_name: string | null; email: string; role: string }>()

  const displayName = profile?.full_name ?? profile?.email ?? user.email ?? 'Student'

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-sm font-semibold">LMS Plus</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{displayName}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  )
}
