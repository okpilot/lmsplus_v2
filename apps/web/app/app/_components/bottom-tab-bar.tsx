'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'
import { MoreButton, MoreSheet, SLOT, tone, useMoreSheet } from './more-sheet'
import { NavIcon } from './nav-icon'
import type { NavItem } from './nav-items'
import { useTabBarModel } from './use-tab-bar-model'
import { useTabSlots } from './use-tab-slots'
import { useUser } from './user-context'

function TabLink({ item, active }: Readonly<{ item: NavItem; active: boolean }>) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`${SLOT} ${tone(active)}`}
    >
      {item.icon && <NavIcon name={item.icon} />}
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  )
}

export function BottomTabBar() {
  const pathname = usePathname()
  const { userRole } = useUser()
  const ref = useRef<HTMLElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const slots = useTabSlots(ref)
  const { visible, hidden, activeHref, moreActive } = useTabBarModel(pathname, userRole, slots)
  const { sheetOpen, setOpen } = useMoreSheet(pathname, hidden.length > 0, moreRef)

  return (
    <>
      <nav
        ref={ref}
        aria-label="Bottom navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-foreground/[0.06] bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {visible.map((item) => (
          <TabLink key={item.href} item={item} active={item.href === activeHref} />
        ))}
        {hidden.length > 0 && (
          <MoreButton
            moreRef={moreRef}
            expanded={sheetOpen}
            active={moreActive}
            onToggle={() => setOpen((o) => !o)}
          />
        )}
      </nav>
      {sheetOpen && (
        <MoreSheet hidden={hidden} activeHref={activeHref} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
