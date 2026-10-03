import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { readActiveSession } from '../_utils/quiz-session-storage'
import {
  applyInitialLoad,
  buildRecoveryResume,
  dropCachedSession,
  loadSessionData,
  readBootstrapSession,
} from './session-bootstrap-load'
import { useBootstrapState } from './use-bootstrap-state'
import { useSessionRecovery } from './use-session-recovery'

export type BootstrapState = ReturnType<typeof useSessionBootstrap>

export function useSessionBootstrap(userId: string) {
  const router = useRouter()
  const { state, setters } = useBootstrapState()
  const { questions, recovery } = state
  const recoveryActions = useSessionRecovery(recovery, userId)

  useEffect(() => {
    if (questions) dropCachedSession(userId)
  }, [questions, userId])

  useEffect(() => {
    const data = readBootstrapSession(userId)
    if (!data) {
      const stored = readActiveSession(userId)
      if (stored) setters.setRecovery(stored)
      else router.replace('/app/quiz')
      return
    }
    setters.setSession(data)
    // Questions, flags and the claim load in parallel; QuizSession mounts once, after all settle.
    loadSessionData(data.questionIds, data)
      .then((r) => applyInitialLoad(r, userId, setters))
      // Error-path net (as in buildRecoveryResume): a throwing setter must not strand the skeleton.
      .catch(() => setters.setError('Failed to load questions. Please try again.'))
  }, [router, userId, setters])

  const resumeInFlightRef = useRef(false)
  const handleRecoveryResume = buildRecoveryResume(recovery, setters, resumeInFlightRef)

  return {
    ...state,
    recoveryActions,
    handleRecoveryResume,
    clearRecovery: () => setters.setRecovery(null),
    clearResumeError: () => setters.setResumeError(null),
  }
}
