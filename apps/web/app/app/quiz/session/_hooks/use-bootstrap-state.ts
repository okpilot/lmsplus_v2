import { useMemo, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { SessionData } from '../_utils/quiz-session-handoff'
import type { ActiveSession } from '../_utils/quiz-session-storage'

// useState setters are stable, so each setters bundle is memoised once and safe in effect dependencies.
function useLoadCells() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<SessionQuestion[] | null>(null)
  const [flaggedIds, setFlaggedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const setters = useMemo(() => ({ setSession, setQuestions, setFlaggedIds, setError }), [])
  return { state: { session, questions, flaggedIds, error }, setters }
}

function useRecoveryCells() {
  const [recovery, setRecovery] = useState<ActiveSession | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const setters = useMemo(
    () => ({ setRecovery, setResumeLoading, setResumeError, setClaimError }),
    [],
  )
  return { state: { recovery, resumeLoading, resumeError, claimError }, setters }
}

/** The bootstrap's eight state cells and their setters, bundled so the orchestrating hook stays short. */
export function useBootstrapState() {
  const load = useLoadCells()
  const recovery = useRecoveryCells()
  const setters = useMemo(
    () => ({ ...load.setters, ...recovery.setters }),
    [load.setters, recovery.setters],
  )
  return { state: { ...load.state, ...recovery.state }, setters }
}
