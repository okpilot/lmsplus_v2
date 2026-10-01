'use client'

import Link from 'next/link'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { NavIcon } from './nav-icon'
import type { NavItem } from './nav-items'

const SHEET_ID = 'bottom-more-sheet'
export const SLOT = 'flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-[11px]'
export const tone = (on: boolean) => (on ? 'font-medium text-foreground' : 'text-foreground/55')

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
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
  onDismiss: () => void
}

export function MoreSheet({ hidden, activeHref, onClose, onDismiss }: Readonly<SheetProps>) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('a')?.focus()
  }, [])

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        aria-label="Close menu"
        className="fixed inset-0 z-30 size-auto cursor-default rounded-none bg-foreground/10"
        onClick={onDismiss}
      />
      <ul
        ref={listRef}
        id={SHEET_ID}
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 rounded-t-2xl border-t border-foreground/[0.06] bg-surface px-2 py-2"
      >
        {hidden.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.href === activeHref ? 'page' : undefined}
              onClick={onClose}
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

/** Open state of the More sheet; closes on route change, Escape or `dismiss` (refocusing More), and when nothing overflows. */
export function useMoreSheet(
  pathname: string,
  hasHidden: boolean,
  moreRef: RefObject<HTMLButtonElement | null>,
) {
  const [open, setOpen] = useState(false)
  const sheetOpen = open && hasHidden

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname change closes the sheet
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!hasHidden) setOpen(false)
  }, [hasHidden])

  const dismiss = useCallback(() => {
    setOpen(false)
    moreRef.current?.focus()
  }, [moreRef])

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen, dismiss])

  return { sheetOpen, setOpen, dismiss }
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
      className={`${SLOT} h-auto rounded-none ${tone(active || expanded)}`}
    >
      <MoreIcon />
      <span className="max-w-full truncate">More</span>
    </Button>
  )
}
