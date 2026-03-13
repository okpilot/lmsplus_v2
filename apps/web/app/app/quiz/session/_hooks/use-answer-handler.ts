import { useEffect, useRef, useState } from 'react'
import { checkAnswer } from '../../actions/check-answer'
import type { AnswerFeedback, DraftAnswer } from '../../types'

type AnswerHandlerOpts = {
  sessionId: string
  getQuestionId: () => string
  getAnswerStartTime: () => number
  answers: Map<string, DraftAnswer>
  setAnswers: React.Dispatch<React.SetStateAction<Map<string, DraftAnswer>>>
}

export function useAnswerHandler(opts: AnswerHandlerOpts) {
  const { sessionId, getQuestionId, getAnswerStartTime, answers, setAnswers } = opts
  const [feedback, setFeedback] = useState<Map<string, AnswerFeedback>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const lockedRef = useRef<Set<string>>(new Set())

  async function handleSelectAnswer(optionId: string) {
    const questionId = getQuestionId()
    if (lockedRef.current.has(questionId) || answers.has(questionId)) return
    lockedRef.current.add(questionId)
    const elapsed = Date.now() - getAnswerStartTime()
    setAnswers((p) =>
      new Map(p).set(questionId, { selectedOptionId: optionId, responseTimeMs: elapsed }),
    )
    try {
      const result = await checkAnswer({ questionId, selectedOptionId: optionId, sessionId })
      if (!result.success) throw new Error(result.error)
      setFeedback((p) =>
        new Map(p).set(questionId, {
          isCorrect: result.isCorrect,
          correctOptionId: result.correctOptionId,
          explanationText: result.explanationText,
          explanationImageUrl: result.explanationImageUrl,
        }),
      )
      setError(null)
    } catch {
      lockedRef.current.delete(questionId)
      setAnswers((p) => {
        const m = new Map(p)
        m.delete(questionId)
        return m
      })
      setError('Failed to check answer. Please try again.')
    }
  }

  // Clear ref lock reactively after state update propagates — not data fetching
  useEffect(() => {
    for (const locked of lockedRef.current) {
      if (!answers.has(locked)) lockedRef.current.delete(locked)
    }
  }, [answers])

  return { feedback, error, handleSelectAnswer }
}
