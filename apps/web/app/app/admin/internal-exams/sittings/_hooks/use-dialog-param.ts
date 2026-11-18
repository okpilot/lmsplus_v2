'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type RefObject, useCallback, useEffect, useRef, useTransition } from 'react'
import type { DialogParam } from '../../_search-params'

/** Refs a provider shares so every consumer of one page sees the same open/close history. */
export type DialogRefs = {
  openedHere: RefObject<boolean>
  openerRef: RefObject<HTMLElement | null>
  /** Set once a close is issued; cleared when `dlg` leaves the URL, so a second close() before the URL updates is a no-op. */
  closing: RefObject<boolean>
}

/**
 * Dialog state in the URL (`?dlg=`). `open` pushes a history entry (recording `opener`, else the focused element, for focus return) and `close` pops it when this
 * session opened the dialog; a deep-linked dialog closes by replacing the URL without `dlg`.
 */
export function useDialogParam(shared?: DialogRefs) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [isRefreshing, startTransition] = useTransition()
  const ownOpenedHere = useRef(false)
  const ownOpener = useRef<HTMLElement | null>(null)
  const ownClosing = useRef(false)
  const openedHere = shared?.openedHere ?? ownOpenedHere
  const openerRef = shared?.openerRef ?? ownOpener
  const closing = shared?.closing ?? ownClosing
  const href = useCallback(
    (dlg: DialogParam | null) => {
      const params = new URLSearchParams(sp.toString())
      if (dlg) params.set('dlg', dlg)
      else params.delete('dlg')
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, sp],
  )
  const open = useCallback(
    (name: DialogParam, opener?: HTMLElement | null) => {
      const active = document.activeElement
      openerRef.current = opener ?? (active instanceof HTMLElement ? active : null)
      openedHere.current = true
      closing.current = false
      startTransition(() => router.push(href(name)))
    },
    [href, router, openedHere, openerRef, closing],
  )
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    if (openedHere.current) {
      openedHere.current = false
      router.back()
      return
    }
    startTransition(() => router.replace(href(null)))
  }, [href, router, openedHere, closing])
  /** True once if this session opened the dialog; clears the flag so a later close() replaces instead of going back. */
  const consumeOpenedHere = useCallback(() => {
    const was = openedHere.current
    openedHere.current = false
    return was
  }, [openedHere])
  const dlg = sp.get('dlg') ?? null
  // Standalone use (no provider): reset here. With a provider, the provider resets.
  useEffect(() => {
    if (!shared && dlg === null) closing.current = false
  }, [shared, dlg, closing])
  return { dlg, isRefreshing, openerRef, open, close, consumeOpenedHere }
}
