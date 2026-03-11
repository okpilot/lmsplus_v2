'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { loadSessionQuestions } from './load-questions'
import { ReviewSession } from './review-session'

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
}

// Cache parsed session to survive React Strict Mode double-mount
let cachedSession: SessionData | null = null

export function ReviewSessionLoader() {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load session data from sessionStorage — this is not data fetching,
  // it's reading a client-side navigation token set by StartReviewButton
  useEffect(() => {
    const raw = sessionStorage.getItem('review-session')
    let data: SessionData | null = null
    if (raw) {
      try {
        data = JSON.parse(raw) as SessionData
      } catch {
        console.error('[ReviewSessionLoader] Malformed session data in sessionStorage')
        sessionStorage.removeItem('review-session')
      }
    } else {
      data = cachedSession
    }

    if (!data) {
      router.replace('/app/review')
      return
    }

    cachedSession = data
    sessionStorage.removeItem('review-session')
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

  return <ReviewSession sessionId={session.sessionId} questions={questions} />
}
