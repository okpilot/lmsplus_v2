'use client'

import { SessionRunner } from '@/app/app/_components/session-runner'
import type { SessionQuestion } from '@/app/app/_components/session-runner'
import { completeQuiz, submitQuizAnswer } from '../../actions'

type QuizSessionProps = {
  sessionId: string
  questions: SessionQuestion[]
}

export function QuizSession({ sessionId, questions }: QuizSessionProps) {
  return (
    <SessionRunner
      sessionId={sessionId}
      questions={questions}
      mode="quick_quiz"
      onSubmitAnswer={submitQuizAnswer}
      onComplete={completeQuiz}
    />
  )
}
