import { useState } from 'react'

export function useFlaggedQuestions() {
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set())

  function toggleFlag(questionId: string) {
    setFlaggedQuestions((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  return { flaggedQuestions, toggleFlag }
}
