import { useRef, useState } from 'react'
import { claimQuizSession } from '../actions/quiz-progress'
import { checkSavedQuizRoom, saveQuizForLater } from '../actions/saved-quiz'
import { getQuizDeviceId } from '../session/_utils/quiz-device-id'
import type { BlockedOffer } from './start-handler-shared'

export type BlockedStartState = {
  offer: BlockedOffer | null
  saving: boolean
  error: string | null
  onAccept: () => void
}

const GENERIC_ERROR = 'Something went wrong. Please try again.'

/** room check → claim → save for later: frees the single active-session slot. */
async function freeActiveSlot(sessionId: string): Promise<string | null> {
  // Checked first: a refused save after the claim would already have taken the quiz over.
  const room = await checkSavedQuizRoom()
  if (!room.success) return room.error
  const deviceId = getQuizDeviceId()
  // The student is taking the quiz over: without the claim, saving raises
  // `session_taken_over` when another device holds it.
  const claim = await claimQuizSession({ sessionId, deviceId })
  if (!claim.success) return claim.error
  const saved = await saveQuizForLater({ sessionId, deviceId })
  return saved.success ? null : saved.error
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
    try {
      const failure = await freeActiveSlot(offer.sessionId)
      if (failure) return setError(failure)
      setOffer(null)
      await start()
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      busyRef.current = false
      setSaving(false)
    }
  }

  return { offer, setOffer, saving, error, accept }
}

/** The alert's view of the blocked-start state, with accept bound to the start to re-run. */
export function toBlockedStartState(
  blocked: ReturnType<typeof useBlockedStart>,
  start: () => unknown,
): BlockedStartState {
  const { offer, saving, error, accept } = blocked
  return { offer, saving, error, onAccept: () => void accept(start) }
}
