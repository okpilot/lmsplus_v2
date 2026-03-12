'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  AnswerResult,
  CompleteResult,
  SessionQuestion,
  SubmitInput,
} from '../_components/session-runner'

type SessionState = 'answering' | 'feedback' | 'complete'

type UseSessionStateProps = {
  sessionId: string
  questions: SessionQuestion[]
  onSubmitAnswer: (input: SubmitInput) => Promise<AnswerResult>
  onComplete: (input: { sessionId: string }) => Promise<CompleteResult>
}

export function useSessionState({
  sessionId,
  questions,
  onSubmitAnswer,
  onComplete,
}: UseSessionStateProps) {
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
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((i) => i + 1)
      setFeedback(null)
      setSelectedOption(null)
      setState('answering')
      return
    }
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
  }

  return {
    state,
    currentIndex,
    feedback,
    submitting,
    selectedOption,
    correctCount,
    scorePercentage,
    error,
    handleSubmit,
    handleNext,
  }
}
