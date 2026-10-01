'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { NavIcon } from './nav-icon'
import { ADMIN_NAV_ITEMS, isActivePath, NAV_ITEMS, type NavItem } from './nav-items'
import { splitTabs } from './split-tabs'
import { useTabSlots } from './use-tab-slots'
import { useUser } from './user-context'

const SHEET_ID = 'bottom-more-sheet'
const SLOT = 'flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-[11px]'
const tone = (on: boolean) => (on ? 'font-medium text-foreground' : 'text-foreground/55')

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}

type SheetProps = { hidden: NavItem[]; activeHref?: string; onClose: () => void }

function MoreSheet({ hidden, activeHref, onClose }: Readonly<SheetProps>) {
  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        aria-label="Close menu"
        className="fixed inset-0 z-30 size-auto cursor-default rounded-none bg-foreground/10"
        onClick={onClose}
      />
      <ul
        id={SHEET_ID}
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 rounded-t-2xl border-t border-foreground/[0.06] bg-surface px-2 py-2"
      >
        {hidden.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.href === activeHref ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm ${tone(item.href === activeHref)}`}
            >
              {item.icon && <NavIcon name={item.icon} className="size-5" />}
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

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

/** Open state of the More sheet; closes on route change, Escape, and when nothing overflows. */
function useMoreSheet(pathname: string, hasHidden: boolean) {
  const [open, setOpen] = useState(false)
  const sheetOpen = open && hasHidden

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname change closes the sheet
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  return { sheetOpen, setOpen }
}

export function BottomTabBar() {
  const pathname = usePathname()
  const { userRole } = useUser()
  const ref = useRef<HTMLElement>(null)
  const slots = useTabSlots(ref)
  const items = userRole === 'admin' ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS
  const { visible, hidden } = splitTabs(items, slots)
  const { sheetOpen, setOpen } = useMoreSheet(pathname, hidden.length > 0)
  const activeHref = items.find((item) => isActivePath(pathname, item.href))?.href
  const moreActive = hidden.some((item) => item.href === activeHref)

  return (
    <>
      {sheetOpen && (
        <MoreSheet hidden={hidden} activeHref={activeHref} onClose={() => setOpen(false)} />
      )}
      <nav
        ref={ref}
        aria-label="Bottom navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-foreground/[0.06] bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {visible.map((item) => (
          <TabLink key={item.href} item={item} active={item.href === activeHref} />
        ))}
        {hidden.length > 0 && (
          <Button
            variant="ghost"
            aria-expanded={sheetOpen}
            aria-controls={SHEET_ID}
            onClick={() => setOpen((o) => !o)}
            className={`${SLOT} h-auto rounded-none ${tone(moreActive || sheetOpen)}`}
          >
            <MoreIcon />
            <span className="max-w-full truncate">More</span>
          </Button>
        )}
      </nav>
    </>
  )
}
