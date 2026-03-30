import { useEffect, useRef, useState } from 'react'
import { checkAnswer } from '../../actions/check-answer'
import type { AnswerFeedback, DraftAnswer } from '../../types'

type AnswerHandlerOpts = {
  sessionId: string
  getQuestionId: () => string
  getAnswerStartTime: () => number
  answers: Map<string, DraftAnswer>
  setAnswers: React.Dispatch<React.SetStateAction<Map<string, DraftAnswer>>>
  onAnswerRecorded?: (answers: Map<string, DraftAnswer>) => void
  onAnswerReverted?: (answers: Map<string, DraftAnswer>) => void
}

export function useAnswerHandler(opts: AnswerHandlerOpts) {
  const {
    sessionId,
    getQuestionId,
    getAnswerStartTime,
    answers,
    setAnswers,
    onAnswerRecorded,
    onAnswerReverted,
  } = opts
  const [feedback, setFeedback] = useState<Map<string, AnswerFeedback>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const lockedRef = useRef<Set<string>>(new Set())
  const answersRef = useRef(answers)
  answersRef.current = answers

  async function handleSelectAnswer(optionId: string): Promise<boolean> {
    const questionId = getQuestionId()
    if (lockedRef.current.has(questionId) || answers.has(questionId)) return false
    lockedRef.current.add(questionId)
    const elapsed = Date.now() - getAnswerStartTime()
    setAnswers((p) => {
      const next = new Map(p).set(questionId, {
        selectedOptionId: optionId,
        responseTimeMs: elapsed,
      })
      answersRef.current = next
      return next
    })
    let result: {
      isCorrect: boolean
      correctOptionId: string
      explanationText: string | null
      explanationImageUrl: string | null
    }
    try {
      const r = await checkAnswer({ questionId, selectedOptionId: optionId, sessionId })
      if (!r.success) throw new Error(r.error)
      result = r
    } catch {
      lockedRef.current.delete(questionId)
      setAnswers((p) => {
        const m = new Map(p)
        m.delete(questionId)
        answersRef.current = m
        return m
      })
      try {
        onAnswerReverted?.(answersRef.current)
      } catch (err) {
        console.warn('[use-answer-handler] Revert checkpoint failed (best-effort):', err)
      }
      setError('Failed to check answer. Please try again.')
      return false
    }
    setFeedback((p) =>
      new Map(p).set(questionId, {
        isCorrect: result.isCorrect,
        correctOptionId: result.correctOptionId,
        explanationText: result.explanationText,
        explanationImageUrl: result.explanationImageUrl,
      }),
    )
    setError(null)
    try {
      onAnswerRecorded?.(
        new Map(answersRef.current).set(questionId, {
          selectedOptionId: optionId,
          responseTimeMs: elapsed,
        }),
      )
    } catch (err) {
      console.warn('[use-answer-handler] Checkpoint write failed (best-effort):', err)
    }
    return true
  }

  // Clear ref lock reactively after state update propagates — not data fetching
  useEffect(() => {
    for (const locked of lockedRef.current) {
      if (!answers.has(locked)) lockedRef.current.delete(locked)
    }
  }, [answers])

  return { feedback, error, handleSelectAnswer, clearError: () => setError(null) }
}
