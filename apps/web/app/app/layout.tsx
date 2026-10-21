import { Suspense } from 'react'
import { LookScope } from '@/components/kit/look-scope'
import { AppShell } from './_components/app-shell'
import { ShellAuthGuard } from './_components/shell-auth-guard'
import { UserProvider } from './_components/user-context'
import { loadShellUser } from './_lib/load-shell-user'

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = loadShellUser()

  return (
    <UserProvider user={user}>
      <Suspense fallback={null}>
        <ShellAuthGuard />
      </Suspense>
      <LookScope>
        <AppShell>{children}</AppShell>
      </LookScope>
    </UserProvider>
  )
}
