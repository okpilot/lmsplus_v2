import { useMemo, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { SessionData } from '../_utils/quiz-session-handoff'
import type { ActiveSession } from '../_utils/quiz-session-storage'

/** The bootstrap's eight state cells and their setters, bundled so the orchestrating hook stays short. */
export function useBootstrapState() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<SessionQuestion[] | null>(null)
  const [flaggedIds, setFlaggedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<ActiveSession | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  // useState setters are stable, so the bundle is memoised once and safe in effect dependencies.
  const setters = useMemo(
    () => ({
      setSession,
      setQuestions,
      setFlaggedIds,
      setError,
      setRecovery,
      setResumeLoading,
      setResumeError,
      setClaimError,
    }),
    [],
  )
  return {
    state: {
      session,
      questions,
      flaggedIds,
      error,
      recovery,
      resumeLoading,
      resumeError,
      claimError,
    },
    setters,
  }
}
