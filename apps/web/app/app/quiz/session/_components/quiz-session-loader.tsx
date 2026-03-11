'use client'

import { loadSessionQuestions } from '@/app/app/review/session/_components/load-questions'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { QuizSession } from './quiz-session'

type Question = {
  id: string
  question_text: string
  question_image_url: string | null
  options: { id: string; text: string }[]
}

type SessionData = {
  sessionId: string
  questionIds: string[]
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

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (!session || !questions) {
    return <p className="text-sm text-muted-foreground">Loading questions...</p>
  }

  return <QuizSession sessionId={session.sessionId} questions={questions} />
}
