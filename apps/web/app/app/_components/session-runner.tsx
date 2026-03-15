'use client'

import { useSessionState } from '../_hooks/use-session-state'
import type { AnswerResult, CompleteResult, SessionQuestion, SubmitInput } from '../_types/session'
import { ActiveSession } from './active-session'
import { SessionSummary } from './session-summary'

type SessionRunnerProps = {
  sessionId: string
  questions: SessionQuestion[]
  onSubmitAnswer: (input: SubmitInput) => Promise<AnswerResult>
  onComplete: (input: { sessionId: string }) => Promise<CompleteResult>
}

export function SessionRunner({
  sessionId,
  questions,
  onSubmitAnswer,
  onComplete,
}: SessionRunnerProps) {
  const s = useSessionState({ sessionId, questions, onSubmitAnswer, onComplete })
  const question = questions[s.currentIndex]
  if (!question) return null
  if (s.state === 'complete') {
    return (
      <SessionSummary
        totalQuestions={questions.length}
        answeredCount={s.answeredCount}
        correctCount={s.correctCount}
        scorePercentage={s.scorePercentage}
      />
    )
  }
  return (
    <ActiveSession
      question={question}
      questions={questions}
      currentIndex={s.currentIndex}
      submitting={s.submitting}
      error={s.error}
      feedback={s.feedback}
      selectedOption={s.selectedOption}
      state={s.state}
      onSubmit={s.handleSubmit}
      onNext={s.handleNext}
    />
  )
}
