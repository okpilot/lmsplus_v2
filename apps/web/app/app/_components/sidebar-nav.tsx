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
  const items = userRole === 'admin' ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
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
      })}
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
