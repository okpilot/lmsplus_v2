'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { loadSessionQuestions } from '@/lib/queries/load-session-questions'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { DraftAnswer } from '../../types'
import { clampIndex } from '../_utils/clamp-index'
import { QuizSession } from './quiz-session'

type Question = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
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

export function QuizSessionLoader() {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      router.replace('/app/quiz')
      return
    }

    // Cache before removing so double-mount still works
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

  const filteredAnswers = (() => {
    if (!session?.draftAnswers || !questions) return session?.draftAnswers
    const questionIdSet = new Set(questions.map((q) => q.id))
    return Object.fromEntries(
      Object.entries(session.draftAnswers).filter(([key]) => questionIdSet.has(key)),
    )
  })()

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

  const clampedIndex =
    session.draftCurrentIndex != null
      ? clampIndex(session.draftCurrentIndex, questions.length)
      : undefined

  return (
    <QuizSession
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
