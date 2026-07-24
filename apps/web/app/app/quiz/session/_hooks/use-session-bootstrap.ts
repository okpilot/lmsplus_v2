import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import { clearSessionHandoff, type SessionData } from '../_utils/quiz-session-handoff'
import { type ActiveSession, readActiveSession } from '../_utils/quiz-session-storage'
import {
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
    // Questions + flags load in parallel; the session renders only once BOTH have
    // settled (QuizSession mounts once — the flag seed cannot be applied late).
    loadSessionData(data.questionIds).then((r) => {
      if (!r.success) return setError(r.error)
      clearSessionHandoff(userId)
      setFlaggedIds(r.flaggedIds)
      setQuestions(r.questions)
    })
  }, [router, userId])

  const resumeInFlightRef = useRef(false)
  const handleRecoveryResume = buildRecoveryResume(
    recovery,
    { setSession, setQuestions, setFlaggedIds, setRecovery, setResumeLoading, setResumeError },
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
    recoveryActions,
    handleRecoveryResume,
    clearRecovery: () => setRecovery(null),
    clearResumeError: () => setResumeError(null),
  }
}
