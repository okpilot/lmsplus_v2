'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { MobileNav } from './mobile-nav'
import { SidebarNav } from './sidebar-nav'
import { SignOutButton } from './sign-out-button'
import { ThemeToggle } from './theme-toggle'
import { useSidebar } from './use-sidebar'

type AppShellProps = {
  displayName: string
  userRole?: string
  children: ReactNode
}

export function AppShell({ displayName, userRole, children }: AppShellProps) {
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebar()
  const isFullscreen = pathname.split('/').includes('session')

  if (isFullscreen) {
    return <div className="min-h-screen bg-background">{children}</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="text-sm font-semibold">LMS Plus</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{displayName}</span>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        <aside
          className={`hidden shrink-0 transition-all duration-200 md:block ${collapsed ? 'w-16' : 'w-48'}`}
        >
          <SidebarNav userRole={userRole} collapsed={collapsed} onToggle={toggle} />
        </aside>
        <div className="min-w-0 flex-1 pb-16 md:pb-0">{children}</div>
      </div>
      <MobileNav />
    </div>
  )
}
