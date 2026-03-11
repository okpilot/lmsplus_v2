import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'
import { MobileNav } from './_components/mobile-nav'
import { SidebarNav } from './_components/sidebar-nav'
import { SignOutButton } from './_components/sign-out-button'
import { ThemeToggle } from './_components/theme-toggle'

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <MobileNav />
            <span className="text-sm font-semibold">LMS Plus</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{displayName}</span>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        <aside className="hidden w-48 shrink-0 md:block">
          <SidebarNav />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
