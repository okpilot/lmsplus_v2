'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { MobileNav } from './mobile-nav'
import { PhoneTopBar } from './phone-top-bar'
import { SidebarNav } from './sidebar-nav'

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const isFullscreen = pathname.split('/').includes('session')

  if (isFullscreen) {
    return <div className="min-h-screen">{children}</div>
  }

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <PhoneTopBar />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 self-start sm:flex border-r border-border bg-card">
        <SidebarNav />
      </aside>
      <div className="min-w-0 flex-1 px-gutter py-section pb-tab-clear sm:pb-section">
        <div className="mx-auto max-w-content">{children}</div>
      </div>
      <MobileNav />
    </div>
  )
}
