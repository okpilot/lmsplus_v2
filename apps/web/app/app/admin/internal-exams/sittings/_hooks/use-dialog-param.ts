'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type RefObject, useCallback, useEffect, useRef, useTransition } from 'react'
import { type DialogParam, readDlgParam } from '../../_search-params'

/** Refs a provider shares so every consumer of one page sees the same open/close history. */
export type DialogRefs = {
  openedHere: RefObject<boolean>
  openerRef: RefObject<HTMLElement | null>
  /** Set once a close is issued; cleared when `dlg` leaves the URL, so a second close() before the URL updates is a no-op. */
  closing: RefObject<boolean>
}

/** `pathname?search` with `dlg` set, or removed when null; other params kept. */
export function dialogHref(pathname: string, search: string, dlg: DialogParam | null): string {
  const params = new URLSearchParams(search)
  if (dlg) params.set('dlg', dlg)
  else params.delete('dlg')
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** The provider's shared refs, else this hook's own (reset here when `dlg` leaves the URL). */
function useDialogRefs(shared: DialogRefs | undefined, dlg: string | null) {
  const own = {
    openedHere: useRef(false),
    openerRef: useRef<HTMLElement | null>(null),
    closing: useRef(false),
  }
  const refs = shared ?? own
  const { openedHere, closing } = refs
  /** True once if this session opened the dialog; clears the flag so a later close() replaces instead of going back. */
  const consumeOpenedHere = useCallback(() => {
    const was = openedHere.current
    openedHere.current = false
    return was
  }, [openedHere])
  useEffect(() => {
    if (!shared && dlg === null) closing.current = false
  }, [shared, dlg, closing])
  return { ...refs, consumeOpenedHere }
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
  const dlg = readDlgParam(sp)
  const { openedHere, openerRef, closing, consumeOpenedHere } = useDialogRefs(shared, dlg)
  const search = sp.toString()
  const open = useCallback(
    (name: DialogParam, opener?: HTMLElement | null) => {
      const active = document.activeElement
      openerRef.current = opener ?? (active instanceof HTMLElement ? active : null)
      openedHere.current = true
      closing.current = false
      startTransition(() => router.push(dialogHref(pathname, search, name)))
    },
    [pathname, search, router, openedHere, openerRef, closing],
  )
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    if (openedHere.current) {
      openedHere.current = false
      router.back()
      return
    }
    startTransition(() => router.replace(dialogHref(pathname, search, null)))
  }, [pathname, search, router, openedHere, closing])
  return { dlg, isRefreshing, openerRef, open, close, consumeOpenedHere }
}
