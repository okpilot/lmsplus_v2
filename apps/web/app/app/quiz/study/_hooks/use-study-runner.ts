import { useCallback, useEffect, useState } from 'react'

/**
 * Manages paging state for the study-mode card runner. Wires the keyboard
 * listener internally so the component stays render-only.
 *
 * goNext is a no-op when `questionsLength` is 0 (never sets a negative index).
 * The clamp effect keeps `currentIndex` in range whenever `questionsLength`
 * shrinks or empties.
 */
export function useStudyRunner(questionsLength: number) {
  const [currentIndex, setCurrentIndex] = useState(0)

  // Keep currentIndex in range if the question set shrinks (or empties) in place,
  // so questions[currentIndex] can't become undefined and render null.
  useEffect(() => {
    setCurrentIndex((i) => (questionsLength === 0 ? 0 : Math.min(i, questionsLength - 1)))
  }, [questionsLength])

  const goPrev = useCallback(() => setCurrentIndex((i) => Math.max(i - 1, 0)), [])
  const goNext = useCallback(
    () =>
      setCurrentIndex((i) => (questionsLength === 0 ? 0 : Math.min(i + 1, questionsLength - 1))),
    [questionsLength],
  )

  // Keyboard paging — arrow keys mirror the prev/next buttons. Not data fetching.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext])

  return { currentIndex, goPrev, goNext }
}
