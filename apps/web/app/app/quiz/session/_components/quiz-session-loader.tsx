'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { loadSessionQuestions } from '@/lib/queries/load-session-questions'
import { discardQuiz } from '../../actions/discard'
import { saveDraft } from '../../actions/draft'
import type { DraftAnswer } from '../../types'
import { clampIndex } from '../_utils/clamp-index'
import {
  type ActiveSession,
  clearActiveSession,
  readActiveSession,
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

// Cache parsed session to survive React Strict Mode double-mount
let cachedSession: SessionData | null = null

export function QuizSessionLoader({ userId }: { userId: string }) {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<ActiveSession | null>(null)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('quiz-session')
    let data: SessionData | null = null
    if (raw) {
      try {
        data = JSON.parse(raw) as SessionData
      } catch {
        console.error('[QuizSessionLoader] Malformed session data in sessionStorage')
        sessionStorage.removeItem('quiz-session')
      }
    } else {
      data = cachedSession
    }

    if (!data) {
      // Check localStorage for a recoverable session before redirecting
      const stored = readActiveSession()
      if (stored) {
        setRecovery(stored)
        return
      }
      router.replace('/app/quiz')
      return
    }

    // Normal boot — clear localStorage since sessionStorage handoff succeeded
    clearActiveSession()
    cachedSession = data
    sessionStorage.removeItem('quiz-session')
    setSession(data)

    loadSessionQuestions(data.questionIds).then((result) => {
      if (result.success) {
        setQuestions(result.questions)
      } else {
        setError(result.error)
      }
    })
  }, [router])

  function handleRecoveryResume() {
    if (!recovery) return
    setRecoveryLoading(true)
    const sessionData: SessionData = {
      sessionId: recovery.sessionId,
      questionIds: recovery.questionIds,
      draftAnswers: recovery.answers,
      draftCurrentIndex: recovery.currentIndex,
      draftId: recovery.draftId,
      subjectName: recovery.subjectName,
      subjectCode: recovery.subjectCode,
    }
    setSession(sessionData)
    setRecovery(null)
    loadSessionQuestions(recovery.questionIds).then((result) => {
      if (result.success) {
        setQuestions(result.questions)
      } else {
        setError(result.error)
      }
      setRecoveryLoading(false)
    })
  }

  async function handleRecoverySave() {
    if (!recovery) return
    setRecoveryLoading(true)
    setRecoveryError(null)
    try {
      const result = await saveDraft({
        sessionId: recovery.sessionId,
        questionIds: recovery.questionIds,
        answers: recovery.answers,
        currentIndex: recovery.currentIndex,
        subjectName: recovery.subjectName,
        subjectCode: recovery.subjectCode,
      })
      if (result.success) {
        clearActiveSession()
        router.replace('/app/quiz')
      } else {
        setRecoveryError(result.error ?? 'Failed to save. Please try again.')
        setRecoveryLoading(false)
      }
    } catch {
      setRecoveryError('Server unavailable. Please try again later.')
      setRecoveryLoading(false)
    }
  }

  function handleRecoveryDiscard() {
    const captured = recovery
    clearActiveSession()
    setRecovery(null)
    router.replace('/app/quiz')
    // Best-effort server cleanup
    if (captured) {
      discardQuiz({ sessionId: captured.sessionId }).catch(() => {})
    }
  }

  if (recovery) {
    return (
      <SessionRecoveryPrompt
        subjectName={recovery.subjectName}
        answeredCount={Object.keys(recovery.answers).length}
        totalCount={recovery.questionIds.length}
        onResume={handleRecoveryResume}
        onSave={handleRecoverySave}
        onDiscard={handleRecoveryDiscard}
        loading={recoveryLoading}
        error={recoveryError}
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
