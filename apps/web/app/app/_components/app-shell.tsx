'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { MobileNav } from './mobile-nav'
import { PhoneTopBar } from './phone-top-bar'
import { SidebarNav } from './sidebar-nav'

type AppShellProps = {
  displayName: string
  userRole?: string
  children: ReactNode
}

export function AppShell({ displayName, userRole, children }: Readonly<AppShellProps>) {
  const pathname = usePathname()
  const isFullscreen = pathname.split('/').includes('session')

  if (isFullscreen) {
    return <div className="min-h-screen">{children}</div>
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <PhoneTopBar />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 self-start md:flex">
        <SidebarNav userRole={userRole} displayName={displayName} />
      </aside>
      <div className="min-w-0 flex-1 px-5 py-8 pb-24 md:px-10 md:pb-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </div>
      <MobileNav />
    </div>
  )
}
