'use client'

import { useEffect, useRef, useState } from 'react'
import type { QuestionTab } from '../../_components/question-tabs'
import { isTypingTarget, nextHighlight, quizKeyAction } from './quiz-key-actions'

type UseQuizKeyboardOpts = {
  /** Current question's option ids, in display order. */
  optionIds: string[]
  /** Resets the answer highlight when this changes (question navigation). */
  currentIndex: number
  isExam: boolean
  /** When false, all shortcuts are ignored (e.g. while a dialog is open). */
  enabled?: boolean
  onNavigate: (delta: number) => void
  onConfirm: (optionId: string) => void
  onTab: (tab: QuestionTab) => void
}

/**
 * Wires keyboard shortcuts for the quiz/exam runner: ← / → navigate, ↑ / ↓ move
 * the answer highlight, Enter submits the highlighted answer, and e / c / s open
 * the Explanation / Comments / Stats tabs (study mode only). Shortcuts are
 * ignored while a text field is focused. Returns the highlighted option id so the
 * answer list can render a focus ring.
 */
export function useQuizKeyboard(opts: UseQuizKeyboardOpts) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  // Reset the answer highlight on question change. The effect body doesn't read
  // currentIndex (it just clears to -1), so biome sees the dep as "unnecessary" —
  // but it's the intentional trigger for the reset, hence the suppression.
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex is the reset trigger, not a read value
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [opts.currentIndex])

  // The keydown listener attaches once; read the latest props/state via refs so it
  // never needs re-binding (and so Enter sees the current highlight, not a stale one).
  const optsRef = useRef(opts)
  optsRef.current = opts
  const highlightRef = useRef(highlightedIndex)
  highlightRef.current = highlightedIndex

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const o = optsRef.current
      if (o.enabled === false || isTypingTarget(e.target)) return
      const action = quizKeyAction(e.key, { isExam: o.isExam })
      if (!action) return
      switch (action.type) {
        case 'navigate':
          e.preventDefault()
          o.onNavigate(action.delta)
          break
        case 'highlight':
          e.preventDefault()
          setHighlightedIndex((i) => nextHighlight(i, action.delta, o.optionIds.length))
          break
        case 'confirm': {
          const id = o.optionIds[highlightRef.current]
          if (id) {
            e.preventDefault()
            o.onConfirm(id)
          }
          break
        }
        case 'tab':
          e.preventDefault()
          o.onTab(action.tab)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return {
    // highlightedIndex may briefly be out of range between a navigation (new
    // optionIds) and the reset effect; the `?? null` yields "no highlight",
    // which is the correct visual outcome for that single render.
    highlightedOptionId: highlightedIndex >= 0 ? (opts.optionIds[highlightedIndex] ?? null) : null,
  }
}
