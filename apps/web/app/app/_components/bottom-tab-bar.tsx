'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'
import { MoreBackdrop, MoreButton, MoreSheet, SLOT, tone, useMoreSheet } from './more-sheet'
import { NavIcon } from './nav-icon'
import type { NavItem, NavViewer } from './nav-items'
import { useTabBarModel } from './use-tab-bar-model'
import { useTabSlots } from './use-tab-slots'

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

function useBottomTabBar(state: NavViewer | undefined) {
  const pathname = usePathname()
  const ref = useRef<HTMLElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const model = useTabBarModel(pathname, state, useTabSlots(ref))
  const sheet = useMoreSheet({ pathname, hasHidden: model.hidden.length > 0, moreRef })
  return { ref, moreRef, ...model, ...sheet }
}

type Bar = ReturnType<typeof useBottomTabBar>

function TabStrip({ bar }: Readonly<{ bar: Bar }>) {
  return (
    <nav
      ref={bar.ref}
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-nav flex h-(--tab-bar-h) border-t border-border bg-background/95 pb-(--safe-bottom) backdrop-blur sm:hidden"
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
          onToggle={bar.toggle}
        />
      )}
    </nav>
  )
}

export function BottomTabBar({
  userRole,
  courseCodes,
}: Readonly<{ userRole?: string; courseCodes?: readonly string[] | null }>) {
  const bar = useBottomTabBar(userRole ? { userRole, courseCodes } : undefined)

  return (
    <>
      <TabStrip bar={bar} />
      {bar.sheetOpen && <MoreBackdrop onDismiss={bar.dismiss} />}
      {bar.sheetOpen && (
        <MoreSheet hidden={bar.hidden} activeHref={bar.activeHref} onClose={bar.close} />
      )}
    </>
  )
}
