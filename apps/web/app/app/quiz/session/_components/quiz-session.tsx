'use client'

import { AnswerOptions } from '@/app/app/_components/answer-options'
import { FeedbackPanel } from '@/app/app/_components/feedback-panel'
import { QuestionCard } from '@/app/app/_components/question-card'
import { SessionSummary } from '@/app/app/_components/session-summary'
import { useEffect, useRef, useState } from 'react'
import { type SubmitQuizAnswerResult, completeQuiz, submitQuizAnswer } from '../../actions'

type Question = {
  id: string
  question_text: string
  question_image_url: string | null
  options: { id: string; text: string }[]
}

type QuizSessionProps = {
  sessionId: string
  questions: Question[]
}

type SessionState = 'answering' | 'feedback' | 'complete'

export function QuizSession({ sessionId, questions }: QuizSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [state, setState] = useState<SessionState>('answering')
  const [feedback, setFeedback] = useState<SubmitQuizAnswerResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [scorePercentage, setScorePercentage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const answerStartTime = useRef(Date.now())

  useEffect(() => {
    if (state === 'answering') {
      answerStartTime.current = Date.now()
    }
  }, [state])

  const question = questions[currentIndex]
  if (!question) return null

  async function handleSubmit(selectedId: string) {
    const q = questions[currentIndex]
    if (!q) return
    setSubmitting(true)
    setSelectedOption(selectedId)
    const responseTimeMs = Date.now() - answerStartTime.current

    const result = await submitQuizAnswer({
      sessionId,
      questionId: q.id,
      selectedOptionId: selectedId,
      responseTimeMs,
    })

    if (!result.success) {
      setError(result.error)
      setSubmitting(false)
      return
    }
    setError(null)
    setFeedback(result)
    if (result.isCorrect) {
      setCorrectCount((c) => c + 1)
    }
    setState('feedback')
    setSubmitting(false)
  }

  async function handleNext() {
    setError(null)
    if (currentIndex + 1 >= questions.length) {
      const result = await completeQuiz({ sessionId })
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
        mode="quick_quiz"
      />
    )
  }

  const feedbackData = feedback?.success ? feedback : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          data-testid="progress-bar"
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      <QuestionCard
        questionText={question.question_text}
        questionImageUrl={question.question_image_url}
        questionNumber={currentIndex + 1}
        totalQuestions={questions.length}
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
