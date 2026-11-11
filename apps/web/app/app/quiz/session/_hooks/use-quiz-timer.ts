'use client'

import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from 'react'
import { parseStartedAt } from '../_utils/parse-started-at'
import { isTakenOver } from '../_utils/session-takeover'

/**
 * Owns the exam timer start and the one-shot auto-submit on expiry. Returns the
 * (stable) timer start, whether time has expired, and the expiry handler that
 * opens the finish dialog exactly once. Extracted from QuizSession to keep that
 * component within its size budget.
 */
export function useQuizTimer(
  startedAt: string | undefined,
  sessionId: string,
  setShowFinishDialog: Dispatch<SetStateAction<boolean>>,
) {
  const timerStartRef = useRef(parseStartedAt(startedAt))
  const autoSubmitFiredRef = useRef(false)
  const [timeExpired, setTimeExpired] = useState(false)

  const handleTimeExpired = useCallback(() => {
    // Swallowed while another tab owns the session; re-evaluated after 'Continue here' reloads.
    if (isTakenOver(sessionId)) return
    if (autoSubmitFiredRef.current) return
    autoSubmitFiredRef.current = true
    setTimeExpired(true)
    setShowFinishDialog(true)
  }, [sessionId, setShowFinishDialog])

  return { timerStart: timerStartRef.current, timeExpired, handleTimeExpired }
}
