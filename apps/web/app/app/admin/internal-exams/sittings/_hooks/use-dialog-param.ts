'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type RefObject, useCallback, useRef, useTransition } from 'react'
import type { DialogParam } from '../../_search-params'

/** Refs a provider shares so every consumer of one page sees the same open/close history. */
export type DialogRefs = {
  openedHere: RefObject<boolean>
  openerRef: RefObject<HTMLElement | null>
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
  const openedHere = shared?.openedHere ?? ownOpenedHere
  const openerRef = shared?.openerRef ?? ownOpener
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
      startTransition(() => router.push(href(name)))
    },
    [href, router, openedHere, openerRef],
  )
  const close = useCallback(() => {
    if (openedHere.current) {
      openedHere.current = false
      router.back()
      return
    }
    startTransition(() => router.replace(href(null)))
  }, [href, router, openedHere])
  return { dlg: sp.get('dlg') ?? null, isRefreshing, openerRef, open, close }
}
