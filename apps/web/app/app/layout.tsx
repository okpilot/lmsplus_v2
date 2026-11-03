import { Suspense } from 'react'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { ActiveUserGate } from './_components/active-user-gate'
import { AppShell } from './_components/app-shell'
import { UserProvider } from './_components/user-context'
import { loadShellUser } from './_lib/load-shell-user'

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const sessionUser = await requireAuthUser()
  const user = loadShellUser(sessionUser)

  return (
    <UserProvider user={user}>
      <Suspense fallback={null}>
        <ActiveUserGate />
      </Suspense>
      <AppShell>{children}</AppShell>
    </UserProvider>
  )
}
