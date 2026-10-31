'use client'

import Link from 'next/link'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { NavIcon } from './nav-icon'
import type { NavItem } from './nav-items'
import { NAV_ACTIVE } from './sidebar-item'

const SHEET_ID = 'bottom-more-sheet'
export const SLOT = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-micro'
export const tone = (on: boolean) =>
  on ? 'font-medium text-primary-text' : 'text-muted-foreground'

const sheetTone = (on: boolean) => (on ? NAV_ACTIVE : 'font-normal text-muted-foreground')

/** `tone` plus hover/expanded overrides that beat the ghost variant's own. */
const moreTone = (on: boolean) =>
  on
    ? 'font-medium text-primary-text hover:text-primary-text aria-expanded:text-primary-text'
    : 'font-normal text-muted-foreground hover:text-muted-foreground'

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-icon-lg" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}

type SheetProps = {
  hidden: NavItem[]
  activeHref?: string
  onClose: () => void
}

export function MoreSheet({ hidden, activeHref, onClose }: Readonly<SheetProps>) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('a')?.focus()
  }, [])

  return (
    <div className="sm:hidden">
      <ul
        ref={listRef}
        id={SHEET_ID}
        className="fixed inset-x-0 bottom-(--tab-bar-h) z-nav rounded-t-sheet border-t border-border bg-card px-2 py-2"
      >
        {hidden.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.href === activeHref ? 'page' : undefined}
              onClick={onClose}
              className={`flex h-11 items-center gap-3 rounded-control px-3 text-label ${sheetTone(item.href === activeHref)}`}
            >
              {item.icon && <NavIcon name={item.icon} className="size-icon-lg" />}
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Sits under the tab bar and sheet (z-scrim), above page content. */
export function MoreBackdrop({ onDismiss }: Readonly<{ onDismiss: () => void }>) {
  return (
    <Button
      variant="ghost"
      aria-label="Close menu"
      className="fixed inset-0 z-scrim size-auto cursor-default rounded-none bg-scrim hover:bg-scrim sm:hidden dark:hover:bg-scrim"
      onClick={onDismiss}
    />
  )
}

type MoreSheetOpts = {
  pathname: string
  hasHidden: boolean
  moreRef: RefObject<HTMLButtonElement | null>
}

function useEscapeToDismiss(active: boolean, dismiss: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, dismiss])
}

/**
 * Open while the current pathname equals the one it was opened on, so a route change hides it in the same render;
 * an effect then clears the stale path so returning does not reopen it.
 * Also closes on Escape or `dismiss` (refocusing More) and when nothing overflows.
 */
export function useMoreSheet({ pathname, hasHidden, moreRef }: MoreSheetOpts) {
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const sheetOpen = openedAt === pathname && hasHidden

  useEffect(() => {
    if (openedAt !== null && openedAt !== pathname) setOpenedAt(null)
  }, [openedAt, pathname])

  useEffect(() => {
    if (!hasHidden && openedAt !== null) setOpenedAt(null)
  }, [hasHidden, openedAt])

  const close = useCallback(() => setOpenedAt(null), [])
  const toggle = useCallback(
    () => setOpenedAt((p) => (p === pathname ? null : pathname)),
    [pathname],
  )
  const dismiss = useCallback(() => {
    setOpenedAt(null)
    moreRef.current?.focus()
  }, [moreRef])

  useEscapeToDismiss(sheetOpen, dismiss)

  return { sheetOpen, toggle, close, dismiss }
}

type MoreButtonProps = {
  moreRef: RefObject<HTMLButtonElement | null>
  expanded: boolean
  active: boolean
  onToggle: () => void
}

export function MoreButton({ moreRef, expanded, active, onToggle }: Readonly<MoreButtonProps>) {
  return (
    <Button
      ref={moreRef}
      variant="ghost"
      aria-expanded={expanded}
      aria-controls={SHEET_ID}
      onClick={onToggle}
      className={`${SLOT} h-auto rounded-none hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent ${moreTone(active || expanded)}`}
    >
      <MoreIcon />
      <span className="max-w-full truncate">More</span>
    </Button>
  )
}
