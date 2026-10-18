import { useEffect, useRef, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { SessionRunnerData } from '../_loaders/load-session-entry'
import { claimQuizDeviceBounded } from '../_utils/claim-quiz-device'
import { clearActiveSession, readActiveSession } from '../_utils/quiz-session-storage'

type Opts = {
  userId: string
  sessionId: string
  runner: Extract<SessionRunnerData, { questions: SessionQuestion[] }>
}

/** The opened session is the student's only active one (docs/security.md §11d): a local copy of another is stale. */
function dropStaleLocalCopy(userId: string, sessionId: string): void {
  if (readActiveSession(userId)?.sessionId !== sessionId) clearActiveSession(userId)
}

/** Claims the server-loaded session for this tab; the questions show once the claim settles. */
export function useServerSessionBootstrap({ userId, sessionId, runner }: Readonly<Opts>) {
  const [claim, setClaim] = useState<{ error: string | null } | null>(null)
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  useEffect(() => {
    let cancelled = false
    void claimQuizDeviceBounded(sessionId).then((error) => {
      if (cancelled) return
      dropStaleLocalCopy(userIdRef.current, sessionId)
      setClaim({ error })
    })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  if (!claim) return { questions: null, flaggedIds: [] as string[], claimError: null }
  return { questions: runner.questions, flaggedIds: runner.flaggedIds, claimError: claim.error }
}
