import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { loadSessionQuestions } from '@/lib/queries/load-session-questions'
import {
  type ActiveSession,
  clearActiveSession,
  clearSessionHandoff,
  readActiveSession,
  readSessionHandoff,
  type SessionData,
} from '../_utils/quiz-session-storage'
import { useSessionRecovery } from './use-session-recovery'

type Question = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  explanation_text: string | null
  explanation_image_url: string | null
  options: { id: string; text: string }[]
}

// Cache parsed session to survive React Strict Mode double-mount, scoped by userId
let cachedSession: { userId: string; session: SessionData } | null = null

/** Exported for testing only — do not use in production code. */
export function _resetCachedSession() {
  cachedSession = null
}

export type BootstrapState = ReturnType<typeof useSessionBootstrap>

export function useSessionBootstrap(userId: string) {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<ActiveSession | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const recoveryActions = useSessionRecovery(recovery, userId)

  // Expire the Strict Mode cache once questions hydrate
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
        setRecovery(stored)
        return
      }
      router.replace('/app/quiz')
      return
    }

    cachedSession = { userId, session: data }
    setSession(data)

    loadSessionQuestions(data.questionIds)
      .then((result) => {
        if (result.success) {
          clearActiveSession(userId)
          clearSessionHandoff(userId)
          setQuestions(result.questions)
        } else {
          setError(result.error)
        }
      })
      .catch(() => {
        setError('Failed to load questions. Please try again.')
      })
  }, [router, userId])

  function handleRecoveryResume() {
    if (!recovery) return
    setResumeLoading(true)
    setResumeError(null)
    loadSessionQuestions(recovery.questionIds)
      .then((result) => {
        if (result.success) {
          clearActiveSession(userId)
          setSession({
            sessionId: recovery.sessionId,
            questionIds: recovery.questionIds,
            draftAnswers: recovery.answers,
            draftCurrentIndex: recovery.currentIndex,
            draftId: recovery.draftId,
            subjectName: recovery.subjectName,
            subjectCode: recovery.subjectCode,
          })
          setQuestions(result.questions)
          setRecovery(null)
        } else {
          setResumeError(result.error ?? 'Failed to load questions. Try again.')
          setResumeLoading(false)
        }
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
