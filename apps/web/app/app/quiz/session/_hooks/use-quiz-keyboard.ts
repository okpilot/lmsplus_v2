'use client'

import { useEffect, useEffectEvent, useState } from 'react'
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
 * the answer highlight, Enter submits the highlighted answer, and q / e / c / s open
 * the Question / Explanation / Comments / Stats tabs (study mode only). Shortcuts are
 * ignored while a text field is focused or Alt, Ctrl or Meta is held. Returns the
 * highlighted option id so the answer list can render a focus ring.
 */
export function useQuizKeyboard(opts: UseQuizKeyboardOpts) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  // Reset the answer highlight on question change. The body doesn't read currentIndex,
  // so biome sees the dep as "unnecessary"; it is the reset trigger, hence the suppression.
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex is the reset trigger, not a read value
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [opts.currentIndex])

  // The keydown listener attaches once; the Effect Event reads the latest props/state so it
  // never needs re-binding (and so Enter sees the current highlight, not a stale one).
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (opts.enabled === false || isTypingTarget(e.target)) return
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const action = quizKeyAction(e.key, { isExam: opts.isExam })
    if (!action) return
    switch (action.type) {
      case 'navigate':
        e.preventDefault()
        opts.onNavigate(action.delta)
        break
      case 'highlight':
        e.preventDefault()
        setHighlightedIndex((i) => nextHighlight(i, action.delta, opts.optionIds.length))
        break
      case 'confirm': {
        const id = opts.optionIds[highlightedIndex]
        if (id) {
          e.preventDefault()
          opts.onConfirm(id)
        }
        break
      }
      case 'tab':
        e.preventDefault()
        opts.onTab(action.tab)
        break
    }
  })

  useEffect(() => {
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
