'use client'

import { SessionRunner } from '@/app/app/_components/session-runner'
import type { SessionQuestion } from '@/app/app/_components/session-runner'
import { completeReviewSession, submitReviewAnswer } from '../../actions'

type ReviewSessionProps = {
  sessionId: string
  questions: SessionQuestion[]
}

export function ReviewSession({ sessionId, questions }: ReviewSessionProps) {
  return (
    <SessionRunner
      sessionId={sessionId}
      questions={questions}
      mode="smart_review"
      onSubmitAnswer={submitReviewAnswer}
      onComplete={completeReviewSession}
    />
  )
}
