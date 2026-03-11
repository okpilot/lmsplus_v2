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

export function QuizSessionLoader() {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('quiz-session')
    if (!raw) {
      router.replace('/app/quiz')
      return
    }

    try {
      const data = JSON.parse(raw) as SessionData
      setSession(data)
      sessionStorage.removeItem('quiz-session')

      loadSessionQuestions(data.questionIds).then((result) => {
        if (result.success) {
          setQuestions(result.questions)
        } else {
          setError(result.error)
        }
      })
    } catch {
      router.replace('/app/quiz')
    }
  }, [router])

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (!session || !questions) {
    return <p className="text-sm text-muted-foreground">Loading questions...</p>
  }

  return <QuizSession sessionId={session.sessionId} questions={questions} />
}
