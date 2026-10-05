import { useRef } from 'react'
import type { QuizStateOpts } from '../../session-types'
import { usePinnedQuestions } from './use-pinned-questions'
import { useProgressSaves } from './use-progress-saves'
import { useQuizNavigation } from './use-quiz-navigation'
import { useTakeoverExit } from './use-takeover-exit'

/**
 * Owns navigation, pins and the background server saves of the quiz runner. Callers never await
 * a save and a failed save never blocks navigation or local buffering. Next.js dispatches Server
 * Actions one at a time per client, so a save still in flight can delay the next answer check
 * by one round trip. Discovery saves nothing. navigateTo saves BEFORE nav resets the answer timer,
 * capturing the leaving question's visit time.
 */
export function useProgressSync(opts: QuizStateOpts) {
  const nav = useQuizNavigation({
    totalQuestions: opts.questions.length,
    initialIndex: opts.initialIndex,
  })
  const pins = usePinnedQuestions(opts.initialPinnedIds)
  const currentIndexRef = useRef(nav.currentIndex)
  currentIndexRef.current = nav.currentIndex
  const { saveError, savePosition, saveAnswer } = useProgressSaves({
    opts,
    currentIndexRef,
    answerStartTime: nav.answerStartTime,
  })
  useTakeoverExit({
    enabled: opts.mode !== 'discovery',
    sessionId: opts.sessionId,
    probe: () => savePosition(currentIndexRef.current, pins.pinnedRef.current, false),
  })
  function navigateTo(index: number) {
    if (index >= 0 && index < opts.questions.length)
      savePosition(index, pins.pinnedRef.current, true)
    nav.navigateTo(index)
  }
  return {
    nav: { ...nav, navigateTo, navigate: (d: number) => navigateTo(currentIndexRef.current + d) },
    currentIndexRef,
    pinnedQuestions: pins.pinnedQuestions,
    togglePin: (id: string) => savePosition(currentIndexRef.current, pins.togglePin(id), false),
    saveAnswer,
    saveError,
  }
}
