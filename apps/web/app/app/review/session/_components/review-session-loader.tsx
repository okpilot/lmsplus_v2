'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { loadSessionQuestions } from './load-questions'
import { ReviewSession } from './review-session'

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

export function ReviewSessionLoader() {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load session data from sessionStorage — this is not data fetching,
  // it's reading a client-side navigation token set by StartReviewButton
  useEffect(() => {
    const raw = sessionStorage.getItem('review-session')
    if (!raw) {
      router.replace('/app/review')
      return
    }

    try {
      const data = JSON.parse(raw) as SessionData
      setSession(data)
      sessionStorage.removeItem('review-session')

      loadSessionQuestions(data.questionIds).then((result) => {
        if (result.success) {
          setQuestions(result.questions)
        } else {
          setError(result.error)
        }
      })
    } catch {
      router.replace('/app/review')
    }
  }, [router])

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (!session || !questions) {
    return <p className="text-sm text-muted-foreground">Loading questions...</p>
  }

  return <ReviewSession sessionId={session.sessionId} questions={questions} />
}
