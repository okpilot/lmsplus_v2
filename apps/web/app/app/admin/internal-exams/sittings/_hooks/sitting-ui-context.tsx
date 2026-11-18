'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import type { ResultBannerData } from '../_utils/copy'
import { type DialogRefs, useDialogParam } from './use-dialog-param'

type Shared = {
  refs: DialogRefs
  /** True while a mutation runs: the open popup cannot be dismissed. */
  locked: boolean
  setLocked: (v: boolean) => void
  banner: ResultBannerData | null
  setBanner: (b: ResultBannerData | null) => void
}

const SittingUiContext = createContext<Shared | null>(null)

/** One banner at a time; plain success is a toast. */
function toastOrBanner(b: ResultBannerData | null, set: (b: ResultBannerData | null) => void) {
  if (b?.tone === 'success') {
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
  }
}

export function SittingUiProvider({ children }: Readonly<{ children: ReactNode }>) {
  const openedHere = useRef(false)
  const openerRef = useRef<HTMLElement | null>(null)
  const [locked, setLocked] = useState(false)
  const [banner, setBannerState] = useState<ResultBannerData | null>(null)
  const setBanner = useCallback(
    (b: ResultBannerData | null) => toastOrBanner(b, setBannerState),
    [],
  )
  const value = useMemo<Shared>(
    () => ({ refs: { openedHere, openerRef }, locked, setLocked, banner, setBanner }),
    [locked, banner, setBanner],
  )
  return <SittingUiContext.Provider value={value}>{children}</SittingUiContext.Provider>
}
