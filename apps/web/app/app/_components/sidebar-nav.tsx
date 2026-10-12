'use client'

import { usePathname } from 'next/navigation'
import { SectionLabel } from '@/components/kit/section-label'
import { ADMIN_NAV_ITEMS, isActivePath, type NavItem, SIDEBAR_GROUPS } from './nav-items'
import { SidebarFooter } from './sidebar-footer'
import { SidebarItem } from './sidebar-item'
import { Wordmark } from './wordmark'

type SidebarNavProps = {
  userRole?: string
  displayName: string
}

function NavGroup({
  label,
  items,
  pathname,
}: Readonly<{ label: string; items: NavItem[]; pathname: string }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <SectionLabel className="px-2.5 pb-1">{label}</SectionLabel>
      {items.map((item) => (
        <SidebarItem key={item.href} item={item} active={isActivePath(pathname, item.href)} />
      ))}
    </div>
  )
}

export function SidebarNav({ userRole, displayName }: Readonly<SidebarNavProps>) {
  const pathname = usePathname()
  const groups =
    userRole === 'admin'
      ? [...SIDEBAR_GROUPS, { label: 'Admin', items: ADMIN_NAV_ITEMS }]
      : SIDEBAR_GROUPS

  return (
    <div className="flex h-full w-full flex-col gap-7 px-3 py-6">
      <span className="px-2.5">
        <Wordmark />
      </span>
      <nav
        aria-label="Main navigation"
        className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto"
      >
        {groups.map((group) => (
          <NavGroup key={group.label} {...group} pathname={pathname} />
        ))}
      </nav>
      <SidebarFooter displayName={displayName} />
    </div>
  )
}
