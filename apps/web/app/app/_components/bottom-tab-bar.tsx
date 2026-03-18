'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NavIcon } from './nav-icon'
import { ADMIN_NAV_ITEMS, NAV_ITEMS } from './nav-items'
import { useUser } from './user-context'

export function BottomTabBar() {
  const pathname = usePathname()
  const { userRole } = useUser()
  const items = userRole === 'admin' ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background md:hidden"
      aria-label="Bottom navigation"
    >
      <div className="flex items-center justify-around pb-[env(safe-area-inset-bottom)] pt-2">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-1 text-xs ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {item.icon && <NavIcon name={item.icon} />}
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
