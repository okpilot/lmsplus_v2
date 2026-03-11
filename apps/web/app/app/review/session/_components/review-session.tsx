'use client'

import { AnswerOptions } from '@/app/app/_components/answer-options'
import { FeedbackPanel } from '@/app/app/_components/feedback-panel'
import { QuestionCard } from '@/app/app/_components/question-card'
import { SessionSummary } from '@/app/app/_components/session-summary'
import { useEffect, useRef, useState } from 'react'
import { type SubmitAnswerResult, completeReviewSession, submitReviewAnswer } from '../../actions'

type Question = {
  id: string
  question_text: string
  question_image_url: string | null
  options: { id: string; text: string }[]
}

type ReviewSessionProps = {
  sessionId: string
  questions: Question[]
}

type SessionState = 'answering' | 'feedback' | 'complete'

export function ReviewSession({ sessionId, questions }: ReviewSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [state, setState] = useState<SessionState>('answering')
  const [feedback, setFeedback] = useState<SubmitAnswerResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [scorePercentage, setScorePercentage] = useState(0)
  const answerStartTime = useRef(Date.now())

  // Reset timer when moving to next question
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

    const result = await submitReviewAnswer({
      sessionId,
      questionId: q.id,
      selectedOptionId: selectedId,
      responseTimeMs,
    })

    setFeedback(result)
    if (result.success && result.isCorrect) {
      setCorrectCount((c) => c + 1)
    }
    setState('feedback')
    setSubmitting(false)
  }

  async function handleNext() {
    if (currentIndex + 1 >= questions.length) {
      const result = await completeReviewSession({ sessionId })
      if (result.success) {
        setCorrectCount(result.correctCount)
        setScorePercentage(result.scorePercentage)
      }
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
        mode="smart_review"
      />
    )
  }

  const feedbackData = feedback?.success ? feedback : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
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
