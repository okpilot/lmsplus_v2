import { useState } from 'react'

export function usePinnedQuestions() {
  const [pinnedQuestions, setPinnedQuestions] = useState<Set<string>>(new Set())

  function togglePin(questionId: string) {
    setPinnedQuestions((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  return { pinnedQuestions, togglePin }
}
