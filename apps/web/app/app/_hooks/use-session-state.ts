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
  const [answeredCount, setAnsweredCount] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [scorePercentage, setScorePercentage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const answerStartTime = useRef(Date.now())
  const submittingRef = useRef(false)

  useEffect(() => {
    if (state === 'answering') answerStartTime.current = Date.now()
  }, [state])

  async function handleSubmit(selectedId: string) {
    if (submittingRef.current) return
    submittingRef.current = true
    const q = questions[currentIndex]
    if (!q) {
      submittingRef.current = false
      return
    }
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
      submittingRef.current = false
      return
    }
    if (!result.success) {
      setError(result.error)
      setSubmitting(false)
      submittingRef.current = false
      return
    }
    setError(null)
    setFeedback(result)
    setAnsweredCount((c) => c + 1)
    if (result.isCorrect) setCorrectCount((c) => c + 1)
    setState('feedback')
    setSubmitting(false)
    submittingRef.current = false
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
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    let result: CompleteResult
    try {
      result = await onComplete({ sessionId })
    } catch (err) {
      console.error('Failed to complete session:', err)
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      submittingRef.current = false
      return
    }
    if (!result.success) {
      setError(result.error)
      setSubmitting(false)
      submittingRef.current = false
      return
    }
    setCorrectCount(result.correctCount)
    setScorePercentage(result.scorePercentage)
    setState('complete')
    setSubmitting(false)
    submittingRef.current = false
  }

  return {
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
  }
}
