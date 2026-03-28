'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { loadSessionQuestions } from '@/lib/queries/load-session-questions'
import type { DraftAnswer } from '../../types'
import { useSessionRecovery } from '../_hooks/use-session-recovery'
import { clampIndex } from '../_utils/clamp-index'
import {
  type ActiveSession,
  clearActiveSession,
  readActiveSession,
  sessionHandoffKey,
} from '../_utils/quiz-session-storage'
import { QuizSession } from './quiz-session'
import { SessionRecoveryPrompt } from './session-recovery-prompt'

type Question = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  explanation_text: string | null
  explanation_image_url: string | null
  options: { id: string; text: string }[]
}

type SessionData = {
  sessionId: string
  questionIds: string[]
  draftAnswers?: Record<string, DraftAnswer>
  draftCurrentIndex?: number
  draftId?: string
  subjectName?: string
  subjectCode?: string
}

function isValidSessionData(data: unknown, expectedUserId: string): data is SessionData {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (typeof d.sessionId !== 'string' || !d.sessionId) return false
  if (!Array.isArray(d.questionIds) || d.questionIds.length === 0) return false
  // Reject cross-user payloads (userId is embedded since the key was scoped)
  if ('userId' in d && d.userId !== expectedUserId) return false
  return true
}

// Cache parsed session to survive React Strict Mode double-mount, scoped by userId
let cachedSession: { userId: string; session: SessionData } | null = null

export function QuizSessionLoader({ userId }: { userId: string }) {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<ActiveSession | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const rv = useSessionRecovery(recovery, userId)

  // Expire the Strict Mode cache once questions hydrate — it only needs to survive the double-mount
  useEffect(() => {
    if (questions && cachedSession?.userId === userId) cachedSession = null
  }, [questions, userId])

  useEffect(() => {
    const key = sessionHandoffKey(userId)
    const raw = sessionStorage.getItem(key)
    let data: SessionData | null = null
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (isValidSessionData(parsed, userId)) {
          data = parsed
        } else {
          console.error('[QuizSessionLoader] Invalid or mismatched session data — discarding')
          sessionStorage.removeItem(key)
        }
      } catch {
        console.error('[QuizSessionLoader] Malformed session data in sessionStorage')
        sessionStorage.removeItem(key)
      }
    } else {
      data = cachedSession?.userId === userId ? cachedSession.session : null
    }

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
          sessionStorage.removeItem(key)
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

  if (recovery) {
    return (
      <SessionRecoveryPrompt
        subjectName={recovery.subjectName}
        answeredCount={Object.keys(recovery.answers).length}
        totalCount={recovery.questionIds.length}
        onResume={handleRecoveryResume}
        onSave={rv.handleSave}
        onDiscard={() => {
          setRecovery(null)
          rv.handleDiscard()
        }}
        loading={rv.loading || resumeLoading}
        error={resumeError ?? rv.error}
      />
    )
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (!session || !questions) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  const filteredAnswers = (() => {
    if (!session.draftAnswers) return session.draftAnswers
    const questionIdSet = new Set(questions.map((q) => q.id))
    return Object.fromEntries(
      Object.entries(session.draftAnswers).filter(([key]) => questionIdSet.has(key)),
    )
  })()

  const clampedIndex =
    session.draftCurrentIndex != null
      ? clampIndex(session.draftCurrentIndex, questions.length)
      : undefined

  return (
    <QuizSession
      userId={userId}
      sessionId={session.sessionId}
      questions={questions}
      initialAnswers={filteredAnswers}
      initialIndex={clampedIndex}
      draftId={session.draftId}
      subjectName={session.subjectName}
      subjectCode={session.subjectCode}
    />
  )
}
