'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type RefObject,
  type TransitionStartFunction,
  useCallback,
  useEffect,
  useRef,
  useTransition,
} from 'react'
import { type DialogParam, POPUP_PARAMS, readDlgParam } from '../../_search-params'

/** The provider's one navigation transition: every consumer sees the same pending state. */
export type DialogNav = { pending: boolean; start: TransitionStartFunction }

/** Refs a provider shares so every consumer of one page sees the same open/close history. */
export type DialogRefs = {
  openedHere: RefObject<boolean>
  openerRef: RefObject<HTMLElement | null>
  /** Set once a close is issued; cleared when `dlg` leaves the URL, so a second close() before the URL updates is a no-op. */
  closing: RefObject<boolean>
  /** Shared transition; without it the hook runs its own. */
  nav?: DialogNav
}

/** `search` without any popup param (`dlg` included). */
function withoutPopupParams(search: string): string {
  const params = new URLSearchParams(search)
  for (const key of POPUP_PARAMS) params.delete(key)
  return params.toString()
}

/** `pathname?search` with `dlg` set, or removed when null; every other popup param is dropped, the rest kept. */
export function dialogHref(pathname: string, search: string, dlg: DialogParam | null): string {
  const params = new URLSearchParams(search)
  for (const key of POPUP_PARAMS) if (key !== 'dlg') params.delete(key)
  if (dlg) params.set('dlg', dlg)
  else params.delete('dlg')
  return withQuery(pathname, params)
}

/** `pathname?search` with each key of `patch` set, or removed when null; other params kept. */
export function paramsHref(
  pathname: string,
  search: string,
  patch: Readonly<Record<string, string | null>>,
): string {
  const params = new URLSearchParams(search)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) params.delete(key)
    else params.set(key, value)
  }
  return withQuery(pathname, params)
}

function withQuery(pathname: string, params: URLSearchParams): string {
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

type Patch = Readonly<Record<string, string | null>>

/** `patch` without the keys the committed `search` already carries (null = absent). */
function stillPending(search: string, patch: Patch): Patch {
  const params = new URLSearchParams(search)
  return Object.fromEntries(Object.entries(patch).filter(([k, v]) => (params.get(k) ?? null) !== v))
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
 * session opened the dialog; a deep-linked dialog closes by replacing the URL without `dlg`. `replaceParams` edits popup params in place (no history entry).
 * Navigation runs in the provider's transition when there is one (`isRefreshing` is then true for every consumer) and never scrolls.
 */
export function useDialogParam(shared?: DialogRefs) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [ownPending, ownStart] = useTransition()
  const isRefreshing = shared?.nav ? shared.nav.pending : ownPending
  const startTransition = shared?.nav ? shared.nav.start : ownStart
  const dlg = readDlgParam(sp)
  const { openedHere, openerRef, closing, consumeOpenedHere } = useDialogRefs(shared, dlg)
  const search = sp.toString()
  /** Patches issued but not yet in `search`; a second replaceParams before the first commits must carry both. */
  const pending = useRef<Patch>({})
  useEffect(() => {
    pending.current = stillPending(search, pending.current)
  }, [search])
  const open = useCallback(
    (name: DialogParam, opener?: HTMLElement | null, extra?: Readonly<Record<string, string>>) => {
      const active = document.activeElement
      openerRef.current = opener ?? (active instanceof HTMLElement ? active : null)
      openedHere.current = true
      closing.current = false
      pending.current = {}
      const href = paramsHref(pathname, withoutPopupParams(search), { dlg: name, ...extra })
      startTransition(() => router.push(href, { scroll: false }))
    },
    [pathname, search, router, startTransition, openedHere, openerRef, closing],
  )
  const replaceParams = useCallback(
    (patch: Patch) => {
      pending.current = { ...pending.current, ...patch }
      const href = paramsHref(pathname, search, pending.current)
      startTransition(() => router.replace(href, { scroll: false }))
    },
    [pathname, search, router, startTransition],
  )
  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    pending.current = {}
    if (openedHere.current) {
      openedHere.current = false
      router.back()
      return
    }
    startTransition(() => router.replace(dialogHref(pathname, search, null), { scroll: false }))
  }, [pathname, search, router, startTransition, openedHere, closing])
  return { dlg, isRefreshing, openerRef, open, replaceParams, close, consumeOpenedHere }
}
