import { useState } from 'react'
import type { QuizStateOpts } from '../../session-types'
import type { DraftAnswer } from '../../types'
import { sendAnswerSave, sendPositionSave } from '../_utils/progress-sync-saves'
import { isTakenOver } from '../_utils/session-takeover'

type SavesDeps = {
  opts: QuizStateOpts
  currentIndexRef: React.MutableRefObject<number>
  answerStartTime: React.MutableRefObject<number>
}

/** Background server saves plus the displayable save error they surface. Discovery saves nothing. */
export function useProgressSaves({ opts, currentIndexRef, answerStartTime }: Readonly<SavesDeps>) {
  const [saveError, setSaveError] = useState<string | null>(opts.initialSaveError ?? null)
  const enabled = opts.mode !== 'discovery'
  const handlers = {
    onSuccess: () => setSaveError(null),
    // The takeover exit follows; the copy would only flash.
    onMappedError: (message: string) => {
      if (!isTakenOver(opts.sessionId)) setSaveError(message)
    },
  }

  function savePosition(target: number, pins: Set<string>, leaving: boolean) {
    if (!enabled) return
    const left = opts.questions[currentIndexRef.current]
    sendPositionSave({
      sessionId: opts.sessionId,
      target,
      pins,
      leaving:
        leaving && left ? { questionId: left.id, startedAt: answerStartTime.current } : undefined,
      ...handlers,
    })
  }
  function saveAnswer(draft: Omit<DraftAnswer, 'responseTimeMs'>) {
    const question = opts.questions[currentIndexRef.current]
    if (!enabled || !question) return
    sendAnswerSave({
      sessionId: opts.sessionId,
      questionId: question.id,
      draft,
      startedAt: answerStartTime.current,
      ...handlers,
    })
  }
  return { saveError, savePosition, saveAnswer }
}
