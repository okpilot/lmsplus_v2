import { useRef, useState } from 'react'

export function usePinnedQuestions() {
  const [pinnedQuestions, setPinnedQuestions] = useState<Set<string>>(new Set())
  // Mirror (code-style §6): a position save reads the pins from a callback that can run
  // before the next render commits.
  const pinnedRef = useRef(pinnedQuestions)

  /** Toggles a pin and returns the resulting set. */
  function togglePin(questionId: string): Set<string> {
    const next = new Set(pinnedRef.current)
    if (next.has(questionId)) next.delete(questionId)
    else next.add(questionId)
    pinnedRef.current = next
    setPinnedQuestions(next)
    return next
  }

  return { pinnedQuestions, pinnedRef, togglePin }
}
