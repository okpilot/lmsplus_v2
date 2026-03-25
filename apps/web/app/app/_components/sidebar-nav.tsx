'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NavIcon } from './nav-icon'
import { ADMIN_NAV_ITEMS, NAV_ITEMS } from './nav-items'

type SidebarNavProps = {
  userRole?: string
  collapsed: boolean
  onToggle: () => void
}

export function SidebarNav({ userRole, collapsed, onToggle }: SidebarNavProps) {
  const pathname = usePathname()
  const isAdmin = userRole === 'admin'

  function renderLink(item: (typeof NAV_ITEMS)[number]) {
    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        } ${collapsed ? 'justify-center px-2' : ''}`}
      >
        {item.icon && <NavIcon name={item.icon} />}
        <span className={collapsed ? 'sr-only' : undefined}>{item.label}</span>
      </Link>
    )
  }

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(renderLink)}

      {isAdmin && (
        <>
          <div className={`mt-4 mb-1 border-t border-border pt-3 ${collapsed ? 'mx-2' : 'mx-3'}`}>
            <span
              className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground ${collapsed ? 'sr-only' : ''}`}
            >
              Admin
            </span>
          </div>
          {ADMIN_NAV_ITEMS.map(renderLink)}
        </>
      )}

      <button
        type="button"
        onClick={onToggle}
        className="mt-4 flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '→' : '← Collapse'}
      </button>
    </nav>
  )
}
