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

type TabLinkProps = { item: NavItem; active: boolean; onClick: () => void }

function TabLink({ item, active, onClick }: Readonly<TabLinkProps>) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`${SLOT} ${tone(active)}`}
    >
      {item.icon && <NavIcon name={item.icon} />}
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  )
}

function useBottomTabBar() {
  const pathname = usePathname()
  const { userRole } = useUser()
  const ref = useRef<HTMLElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const model = useTabBarModel(pathname, userRole, useTabSlots(ref))
  const sheet = useMoreSheet(pathname, model.hidden.length > 0, moreRef)
  return { ref, moreRef, ...model, ...sheet }
}

type Bar = ReturnType<typeof useBottomTabBar>

function TabStrip({ bar }: Readonly<{ bar: Bar }>) {
  return (
    <nav
      ref={bar.ref}
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t border-foreground/[0.06] bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {bar.visible.map((item) => (
        <TabLink
          key={item.href}
          item={item}
          active={item.href === bar.activeHref}
          onClick={bar.close}
        />
      ))}
      {bar.hidden.length > 0 && (
        <MoreButton
          moreRef={bar.moreRef}
          expanded={bar.sheetOpen}
          active={bar.moreActive}
          onToggle={() => bar.setOpen((o) => !o)}
        />
      )}
    </nav>
  )
}

export function BottomTabBar() {
  const bar = useBottomTabBar()

  return (
    <>
      <TabStrip bar={bar} />
      {bar.sheetOpen && (
        <MoreSheet
          hidden={bar.hidden}
          activeHref={bar.activeHref}
          onClose={bar.close}
          onDismiss={bar.dismiss}
        />
      )}
    </>
  )
}
