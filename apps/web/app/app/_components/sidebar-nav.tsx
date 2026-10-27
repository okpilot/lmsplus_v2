'use client'

import { usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { SectionLabel } from '@/components/kit/section-label'
import {
  ADMIN_NAV_ITEMS,
  isActivePath,
  type NavItem,
  SIDEBAR_GROUPS,
  visibleNavItems,
} from './nav-items'
import { SidebarFooter } from './sidebar-footer'
import { SidebarItem } from './sidebar-item'
import { useUser } from './user-context'
import { Wordmark } from './wordmark'

const VFR_RT_HREF = '/app/vfr-rt'

/** Leaf gate: suspends on the user alone, so other items render immediately. Hidden until known. */
function VfrRtItem(props: Readonly<{ item: NavItem; active: boolean }>) {
  const { userRole, courseCodes } = useUser()
  if (visibleNavItems([props.item], { userRole, courseCodes }).length === 0) return null
  return <SidebarItem {...props} />
}

function VfrRtNavGate(props: Readonly<{ item: NavItem; active: boolean }>) {
  return (
    <Suspense fallback={null}>
      <VfrRtItem {...props} />
    </Suspense>
  )
}

function NavGroup({
  label,
  items,
  pathname,
}: Readonly<{ label: string; items: NavItem[]; pathname: string }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <SectionLabel className="px-2.5 pb-1">{label}</SectionLabel>
      {items.map((item) => {
        const Item = item.href === VFR_RT_HREF ? VfrRtNavGate : SidebarItem
        return <Item key={item.href} item={item} active={isActivePath(pathname, item.href)} />
      })}
    </div>
  )
}

function AdminNavGroup({ pathname }: Readonly<{ pathname: string }>) {
  if (useUser().userRole !== 'admin') return null
  return <NavGroup label="Admin" items={ADMIN_NAV_ITEMS} pathname={pathname} />
}

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <div className="flex h-full w-full flex-col gap-7 px-3 py-6">
      <span className="px-2.5">
        <Wordmark />
      </span>
      <nav
        aria-label="Main navigation"
        className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto"
      >
        {SIDEBAR_GROUPS.map((group) => (
          <NavGroup key={group.label} {...group} pathname={pathname} />
        ))}
        <Suspense fallback={null}>
          <AdminNavGroup pathname={pathname} />
        </Suspense>
      </nav>
      <SidebarFooter />
    </div>
  )
}
