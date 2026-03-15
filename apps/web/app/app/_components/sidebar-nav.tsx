'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_NAV_ITEMS, NAV_ITEMS } from './nav-items'

type SidebarNavProps = {
  userRole?: string
}

export function SidebarNav({ userRole }: SidebarNavProps) {
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
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
