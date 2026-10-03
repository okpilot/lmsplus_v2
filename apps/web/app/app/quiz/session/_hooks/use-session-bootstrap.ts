import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { SessionData } from '../_utils/quiz-session-handoff'
import { type ActiveSession, readActiveSession } from '../_utils/quiz-session-storage'
import {
  applyInitialLoad,
  buildRecoveryResume,
  dropCachedSession,
  loadSessionData,
  readBootstrapSession,
} from './session-bootstrap-load'
import { useSessionRecovery } from './use-session-recovery'

export type BootstrapState = ReturnType<typeof useSessionBootstrap>

export function useSessionBootstrap(userId: string) {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<SessionQuestion[] | null>(null)
  const [flaggedIds, setFlaggedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<ActiveSession | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const recoveryActions = useSessionRecovery(recovery, userId)

  useEffect(() => {
    if (questions) dropCachedSession(userId)
  }, [questions, userId])

  useEffect(() => {
    const data = readBootstrapSession(userId)
    if (!data) {
      const stored = readActiveSession(userId)
      if (stored) setRecovery(stored)
      else router.replace('/app/quiz')
      return
    }
    setSession(data)
    // Questions, flags and the claim load in parallel; QuizSession mounts once, after all settle.
    loadSessionData(data.questionIds, data)
      .then((r) =>
        applyInitialLoad(r, userId, { setError, setFlaggedIds, setQuestions, setClaimError }),
      )
      // Error-path net (as in buildRecoveryResume): a throwing setter must not strand the skeleton.
      .catch(() => setError('Failed to load questions. Please try again.'))
  }, [router, userId])

  const resumeInFlightRef = useRef(false)
  const handleRecoveryResume = buildRecoveryResume(
    recovery,
    {
      setSession,
      setQuestions,
      setFlaggedIds,
      setRecovery,
      setResumeLoading,
      setResumeError,
      setClaimError,
    },
    resumeInFlightRef,
  )

  return {
    session,
    questions,
    flaggedIds,
    error,
    recovery,
    resumeLoading,
    resumeError,
    claimError,
    recoveryActions,
    handleRecoveryResume,
    clearRecovery: () => setRecovery(null),
    clearResumeError: () => setResumeError(null),
  }
}
