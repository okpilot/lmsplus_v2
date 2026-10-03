import { useRef, useState } from 'react'
import type { QuizStateOpts } from '../../session-types'
import type { DraftAnswer } from '../../types'
import { buildAnswerInput, buildPositionInput, fireProgressSave } from '../_utils/progress-save'
import { getQuizDeviceId } from '../_utils/quiz-device-id'
import { usePinnedQuestions } from './use-pinned-questions'
import { useQuizNavigation } from './use-quiz-navigation'

/**
 * Owns navigation, pins and the background server saves of the quiz runner. Saves are
 * fire-and-forget (never block grading, navigation or local buffering); Discovery saves nothing.
 */
export function useProgressSync(opts: QuizStateOpts) {
  const nav = useQuizNavigation({
    totalQuestions: opts.questions.length,
    initialIndex: opts.initialIndex,
  })
  const { pinnedQuestions, pinnedRef, togglePin: togglePinById } = usePinnedQuestions()
  const currentIndexRef = useRef(nav.currentIndex)
  currentIndexRef.current = nav.currentIndex
  const [saveError, setSaveError] = useState<string | null>(opts.initialSaveError ?? null)
  const enabled = opts.mode !== 'discovery'
  const deviceId = () => getQuizDeviceId()
  const clear = () => setSaveError(null)

  function savePosition(target: number, pins: Set<string>, leaving: boolean) {
    if (!enabled) return
    const left = opts.questions[currentIndexRef.current]
    fireProgressSave({
      kind: 'position',
      input: buildPositionInput({
        sessionId: opts.sessionId,
        deviceId: deviceId(),
        currentIndex: target,
        pinnedQuestionIds: pins,
        leaving:
          leaving && left
            ? { questionId: left.id, timeSpentMs: Date.now() - nav.answerStartTime.current }
            : undefined,
      }),
      onSuccess: clear,
      onMappedError: setSaveError,
    })
  }

  // Capture the leaving question + its visit time BEFORE nav resets the answer timer.
  function navigateTo(index: number) {
    if (index >= 0 && index < opts.questions.length) savePosition(index, pinnedRef.current, true)
    nav.navigateTo(index)
  }

  function saveAnswer(draft: Omit<DraftAnswer, 'responseTimeMs'>) {
    const question = opts.questions[currentIndexRef.current]
    if (!enabled || !question) return
    const input = buildAnswerInput({
      sessionId: opts.sessionId,
      deviceId: deviceId(),
      questionId: question.id,
      draft,
      timeSpentMs: Date.now() - nav.answerStartTime.current,
    })
    if (input)
      fireProgressSave({ kind: 'answer', input, onSuccess: clear, onMappedError: setSaveError })
  }

  function togglePin(questionId: string) {
    savePosition(currentIndexRef.current, togglePinById(questionId), false)
  }

  return {
    nav: { ...nav, navigateTo, navigate: (d: number) => navigateTo(currentIndexRef.current + d) },
    currentIndexRef,
    pinnedQuestions,
    togglePin,
    saveAnswer,
    saveError,
  }
}
