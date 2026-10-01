import { useCallback, useRef, useState } from 'react'
import type { DraftAnswer } from '../../types'

type UseExamAnswerBufferOpts = {
  getQuestionId: () => string
  getAnswerStartTime: () => number
  initialAnswers?: Record<string, DraftAnswer>
}

export function useExamAnswerBuffer(opts: UseExamAnswerBufferOpts) {
  const [answers, setAnswers] = useState<Map<string, DraftAnswer>>(() =>
    opts.initialAnswers ? new Map(Object.entries(opts.initialAnswers)) : new Map(),
  )
  const answersRef = useRef(answers)

  const recordAnswer = useCallback(
    (draft: Omit<DraftAnswer, 'responseTimeMs'>): boolean => {
      const questionId = opts.getQuestionId()
      if (answersRef.current.has(questionId)) return false // already locked
      const elapsed = Date.now() - opts.getAnswerStartTime()
      const next = new Map(answersRef.current).set(questionId, {
        ...draft,
        responseTimeMs: elapsed,
      })
      answersRef.current = next
      setAnswers(next)
      return true
    },
    [opts],
  )

  const confirmAnswer = useCallback(
    (optionId: string): boolean => recordAnswer({ selectedOptionId: optionId }),
    [recordAnswer],
  )

  return { answers, answersRef, confirmAnswer, recordAnswer }
}
