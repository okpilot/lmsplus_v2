'use client'

import { useSessionState } from '../_hooks/use-session-state'
import { AnswerOptions } from './answer-options'
import { FeedbackPanel } from './feedback-panel'
import { QuestionCard } from './question-card'
import { SessionSummary } from './session-summary'
import { SessionTimer } from './session-timer'

export type SessionQuestion = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  options: { id: string; text: string }[]
}

export type AnswerResult =
  | {
      success: true
      isCorrect: boolean
      correctOptionId: string
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | { success: false; error: string }

export type CompleteResult =
  | { success: true; totalQuestions: number; correctCount: number; scorePercentage: number }
  | { success: false; error: string }

export type SubmitInput = {
  sessionId: string
  questionId: string
  selectedOptionId: string
  responseTimeMs: number
}

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
  const {
    state,
    currentIndex,
    answeredCount,
    feedback,
    submitting,
    selectedOption,
    correctCount,
    scorePercentage,
    error,
    handleSubmit,
    handleNext,
  } = useSessionState({ sessionId, questions, onSubmitAnswer, onComplete })

  const question = questions[currentIndex]
  if (!question) return null

  if (state === 'complete') {
    return (
      <SessionSummary
        totalQuestions={questions.length}
        answeredCount={answeredCount}
        correctCount={correctCount}
        scorePercentage={scorePercentage}
      />
    )
  }

  const feedbackData = feedback?.success ? feedback : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div
            data-testid="progress-bar"
            className="h-1.5 rounded-full bg-primary transition-all"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
        <SessionTimer />
      </div>
      <QuestionCard
        questionText={question.question_text}
        questionImageUrl={question.question_image_url}
        questionNumber={currentIndex + 1}
        totalQuestions={questions.length}
        dbQuestionNumber={question.question_number}
      />
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <AnswerOptions
        options={question.options}
        onSubmit={handleSubmit}
        disabled={submitting || state === 'feedback'}
        correctOptionId={feedbackData?.correctOptionId}
        selectedOptionId={feedbackData ? selectedOption : null}
      />
      {state === 'feedback' && feedbackData && (
        <FeedbackPanel
          isCorrect={feedbackData.isCorrect}
          explanationText={feedbackData.explanationText}
          explanationImageUrl={feedbackData.explanationImageUrl}
          onNext={handleNext}
        />
      )}
    </div>
  )
}
