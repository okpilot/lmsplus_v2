import { useRef, useState } from 'react'
import { freeActiveSlot } from './free-active-slot'
import type { BlockedOffer } from './start-handler-shared'

export type BlockedStartState = {
  offer: BlockedOffer | null
  saving: boolean
  error: string | null
  onAccept: () => void
}

/** Runs the re-run start; a rejection is logged, never shown as the hook's error. */
async function runStart(start: () => unknown): Promise<void> {
  try {
    await start()
  } catch (e) {
    console.error('[blockedStart] start failed:', e instanceof Error ? e.message : String(e))
  }
}

/**
 * Owns the blocked-start offer: "Save quiz for later and start <X>". Accepting checks the
 * saved-quiz cap, claims the blocking practice quiz, saves it, then re-runs the start. Any error
 * is shown and the start does not run.
 */
export function useBlockedStart() {
  const [offer, setOffer] = useState<BlockedOffer | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot lock (code-style §6): `saving` is async state.
  const busyRef = useRef(false)

  async function accept(start: () => unknown) {
    if (!offer || busyRef.current) return
    busyRef.current = true
    setSaving(true)
    setError(null)
    const failure = await freeActiveSlot(offer.sessionId)
    busyRef.current = false
    setSaving(false)
    if (failure) return setError(failure)
    setOffer(null)
    await runStart(start)
  }

  function showOffer(next: BlockedOffer | null) {
    setError(null)
    setOffer(next)
  }

  return { offer, setOffer: showOffer, saving, error, accept }
}

/** The alert's view of the blocked-start state, with accept bound to the start to re-run. */
export function toBlockedStartState(
  blocked: ReturnType<typeof useBlockedStart>,
  start: () => unknown,
): BlockedStartState {
  const { offer, saving, error, accept } = blocked
  return { offer, saving, error, onAccept: () => void accept(start) }
}
