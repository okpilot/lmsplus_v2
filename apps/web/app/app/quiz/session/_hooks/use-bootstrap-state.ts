import { useMemo, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { SessionData } from '../_utils/quiz-session-handoff'

// useState setters are stable, so the setters bundle is memoised once and safe in effect dependencies.
/** The bootstrap's load cells and their setters, bundled so the orchestrating hook stays short. */
export function useBootstrapState() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<SessionQuestion[] | null>(null)
  const [flaggedIds, setFlaggedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const setters = useMemo(
    () => ({ setSession, setQuestions, setFlaggedIds, setError, setClaimError }),
    [],
  )
  return { state: { session, questions, flaggedIds, error, claimError }, setters }
}
