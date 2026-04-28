import { useCallback, useRef, useState } from 'react'
import type { DraftAnswer } from '../../types'

type UseExamAnswerBufferOpts = {
  getQuestionId: () => string
  getAnswerStartTime: () => number
}

export function useExamAnswerBuffer(opts: UseExamAnswerBufferOpts) {
  const [answers, setAnswers] = useState<Map<string, DraftAnswer>>(new Map())
  const answersRef = useRef(answers)

  const confirmAnswer = useCallback(
    (optionId: string): boolean => {
      const questionId = opts.getQuestionId()
      if (answersRef.current.has(questionId)) return false // already locked
      const elapsed = Date.now() - opts.getAnswerStartTime()
      const next = new Map(answersRef.current).set(questionId, {
        selectedOptionId: optionId,
        responseTimeMs: elapsed,
      })
      answersRef.current = next
      setAnswers(next)
      return true
    },
    [opts],
  )

  return { answers, answersRef, confirmAnswer }
}
