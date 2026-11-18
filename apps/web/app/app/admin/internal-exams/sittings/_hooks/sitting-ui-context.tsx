'use client'

import { useSearchParams } from 'next/navigation'
import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { toast } from 'sonner'
import { readDlgParam } from '../../_search-params'
import type { ResultBannerData } from '../_utils/copy'
import { type DialogRefs, useDialogParam } from './use-dialog-param'
import {
  type InitialSelection,
  NO_ROSTER,
  type RosterSelection,
  useRosterSelection,
} from './use-roster-selection'
import { type TickSet, useTickSet } from './use-tick-set'

type Shared = {
  refs: DialogRefs
  /** True while a mutation runs: the open popup cannot be dismissed. */
  locked: boolean
  setLocked: (v: boolean) => void
  banner: ResultBannerData | null
  setBanner: (b: ResultBannerData | null) => void
  roster: RosterSelection
  /** Ticks of the Add people popup; they survive popup param changes. */
  people: TickSet
  /** Search text typed but not yet written to the URL; Show flushes it with its own write. */
  searchDraft: MutableRefObject<string | null>
}

const SittingUiContext = createContext<Shared | null>(null)

const NO_PEOPLE: TickSet = {
  ids: [],
  toggle: () => undefined,
  setMany: () => undefined,
  clear: () => undefined,
}

/** One banner at a time; success is a toast, unless it carries lines (those stay readable in the banner). */
function toastOrBanner(b: ResultBannerData | null, set: (b: ResultBannerData | null) => void) {
  if (b?.tone === 'success' && !b.lines?.length) {
    set(null)
    toast.success(b.title, b.detail ? { description: b.detail } : undefined)
  } else set(b)
}

/** Dialog URL state plus the page's shared lock and result banner. Works without a provider (nothing shared). */
export function useSittingUi() {
  const shared = useContext(SittingUiContext)
  const dialog = useDialogParam(shared?.refs)
  const noBanner = useCallback((b: ResultBannerData | null) => {
    if (b && b.tone !== 'success') toast.error(b.title)
    else toastOrBanner(b, () => undefined)
  }, [])
  return {
    ...dialog,
    locked: shared?.locked ?? false,
    setLocked: shared?.setLocked ?? (() => undefined),
    banner: shared?.banner ?? null,
    setBanner: shared?.setBanner ?? noBanner,
    ...(shared?.roster ?? NO_ROSTER),
    people: shared?.people ?? NO_PEOPLE,
    searchDraft: shared?.searchDraft,
  }
}

type ProviderProps = { children: ReactNode; initialSelection?: InitialSelection }

export function SittingUiProvider({ children, initialSelection }: Readonly<ProviderProps>) {
  const openedHere = useRef(false)
  const openerRef = useRef<HTMLElement | null>(null)
  const closing = useRef(false)
  const dlg = readDlgParam(useSearchParams())
  useEffect(() => {
    if (dlg === null) {
      closing.current = false
      openedHere.current = false
    }
  }, [dlg])
  const [locked, setLocked] = useState(false)
  const [banner, setBannerState] = useState<ResultBannerData | null>(null)
  const setBanner = useCallback(
    (b: ResultBannerData | null) => toastOrBanner(b, setBannerState),
    [],
  )
  const roster = useRosterSelection(initialSelection)
  const people = useTickSet()
  const [pending, start] = useTransition()
  const searchDraft = useRef<string | null>(null)
  const value = useMemo<Shared>(
    () => ({
      refs: { openedHere, openerRef, closing, nav: { pending, start } },
      locked,
      setLocked,
      banner,
      setBanner,
      roster,
      people,
      searchDraft,
    }),
    [locked, banner, setBanner, roster, people, pending],
  )
  return <SittingUiContext.Provider value={value}>{children}</SittingUiContext.Provider>
}
