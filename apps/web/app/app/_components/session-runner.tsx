'use client'

import { useEffect, useRef, useState } from 'react'
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

type SubmitInput = {
  sessionId: string
  questionId: string
  selectedOptionId: string
  responseTimeMs: number
}

type SessionRunnerProps = {
  sessionId: string
  questions: SessionQuestion[]
  mode: 'quick_quiz' | 'smart_review'
  onSubmitAnswer: (input: SubmitInput) => Promise<AnswerResult>
  onComplete: (input: { sessionId: string }) => Promise<CompleteResult>
}

type SessionState = 'answering' | 'feedback' | 'complete'

export function SessionRunner({
  sessionId,
  questions,
  mode,
  onSubmitAnswer,
  onComplete,
}: SessionRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [state, setState] = useState<SessionState>('answering')
  const [feedback, setFeedback] = useState<AnswerResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [scorePercentage, setScorePercentage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const answerStartTime = useRef(Date.now())

  useEffect(() => {
    if (state === 'answering') answerStartTime.current = Date.now()
  }, [state])

  const question = questions[currentIndex]
  if (!question) return null

  async function handleSubmit(selectedId: string) {
    const q = questions[currentIndex]
    if (!q) return
    setSubmitting(true)
    setSelectedOption(selectedId)
    const responseTimeMs = Date.now() - answerStartTime.current
    let result: AnswerResult
    try {
      result = await onSubmitAnswer({
        sessionId,
        questionId: q.id,
        selectedOptionId: selectedId,
        responseTimeMs,
      })
    } catch (err) {
      console.error('Failed to submit answer:', err)
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }
    if (!result.success) {
      setError(result.error)
      setSubmitting(false)
      return
    }
    setError(null)
    setFeedback(result)
    if (result.isCorrect) setCorrectCount((c) => c + 1)
    setState('feedback')
    setSubmitting(false)
  }

  async function handleNext() {
    setError(null)
    if (currentIndex + 1 >= questions.length) {
      let result: CompleteResult
      try {
        result = await onComplete({ sessionId })
      } catch (err) {
        console.error('Failed to complete session:', err)
        setError('Something went wrong. Please try again.')
        return
      }
      if (!result.success) {
        setError(result.error)
        return
      }
      setCorrectCount(result.correctCount)
      setScorePercentage(result.scorePercentage)
      setState('complete')
    } else {
      setCurrentIndex((i) => i + 1)
      setFeedback(null)
      setSelectedOption(null)
      setState('answering')
    }
  }

  if (state === 'complete') {
    return (
      <SessionSummary
        totalQuestions={questions.length}
        correctCount={correctCount}
        scorePercentage={scorePercentage}
        mode={mode}
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
