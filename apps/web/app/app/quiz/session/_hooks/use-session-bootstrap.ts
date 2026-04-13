import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { SessionQuestion } from '@/app/app/_types/session'
import { loadSessionQuestions } from '@/lib/queries/load-session-questions'
import {
  type ActiveSession,
  clearActiveSession,
  clearSessionHandoff,
  readActiveSession,
  readSessionHandoff,
  type SessionData,
  toSessionData,
} from '../_utils/quiz-session-storage'
import { useSessionRecovery } from './use-session-recovery'

let cachedSession: { userId: string; session: SessionData } | null = null
/** @internal Test-only reset for module-level cache. */
export function _resetCachedSession() {
  cachedSession = null
}
export type BootstrapState = ReturnType<typeof useSessionBootstrap>

export function useSessionBootstrap(userId: string) {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<SessionQuestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<ActiveSession | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const recoveryActions = useSessionRecovery(recovery, userId)

  useEffect(() => {
    if (questions && cachedSession?.userId === userId) cachedSession = null
  }, [questions, userId])

  useEffect(() => {
    const data =
      readSessionHandoff(userId) ??
      (cachedSession?.userId === userId ? cachedSession.session : null)

    if (!data) {
      const stored = readActiveSession(userId)
      if (stored) {
        if (stored.mode === 'exam') {
          clearActiveSession(userId)
          toast.info('Your exam session has expired.')
          router.replace('/app/quiz')
          return
        }
        setRecovery(stored)
        return
      }
      router.replace('/app/quiz')
      return
    }

    cachedSession = { userId, session: data }
    setSession(data)
    loadSessionQuestions(data.questionIds)
      .then((r) => {
        if (r.success) {
          clearSessionHandoff(userId)
          setQuestions(r.questions)
        } else {
          setError(r.error)
        }
      })
      .catch(() => setError('Failed to load questions. Please try again.'))
  }, [router, userId])

  function handleRecoveryResume() {
    if (!recovery) return
    setResumeLoading(true)
    setResumeError(null)
    loadSessionQuestions(recovery.questionIds)
      .then((r) => {
        if (!r.success) {
          setResumeError(r.error ?? 'Failed to load questions. Try again.')
          setResumeLoading(false)
          return
        }
        setSession(toSessionData(recovery))
        setQuestions(r.questions)
        setResumeLoading(false)
        setRecovery(null)
      })
      .catch(() => {
        setResumeError('Failed to load questions. Please try again.')
        setResumeLoading(false)
      })
  }

  return {
    session,
    questions,
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
