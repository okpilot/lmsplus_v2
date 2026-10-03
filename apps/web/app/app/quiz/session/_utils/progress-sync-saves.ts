import type { DraftAnswer } from '../../types'
import { buildAnswerInput, buildPositionInput, fireProgressSave } from './progress-save'
import { getQuizDeviceId } from './quiz-device-id'

type SaveHandlers = {
  onSuccess: () => void
  onMappedError: (message: string) => void
}

type PositionSaveOpts = SaveHandlers & {
  sessionId: string
  target: number
  pins: Set<string>
  /** The question being left and when its visit started; omitted when the position moves in place. */
  leaving?: { questionId: string; startedAt: number }
}

/** Fires the background position save; `leaving` adds the left question's visit time. */
export function sendPositionSave(opts: PositionSaveOpts): void {
  const { leaving } = opts
  fireProgressSave({
    kind: 'position',
    sessionId: opts.sessionId,
    input: buildPositionInput({
      sessionId: opts.sessionId,
      deviceId: getQuizDeviceId(),
      currentIndex: opts.target,
      pinnedQuestionIds: opts.pins,
      leaving: leaving && {
        questionId: leaving.questionId,
        timeSpentMs: Date.now() - leaving.startedAt,
      },
    }),
    onSuccess: opts.onSuccess,
    onMappedError: opts.onMappedError,
  })
}

type AnswerSaveOpts = SaveHandlers & {
  sessionId: string
  questionId: string
  draft: Omit<DraftAnswer, 'responseTimeMs'>
  startedAt: number
}

/** Fires the background answer save; a draft carrying no answer saves nothing. */
export function sendAnswerSave(opts: AnswerSaveOpts): void {
  const input = buildAnswerInput({
    sessionId: opts.sessionId,
    deviceId: getQuizDeviceId(),
    questionId: opts.questionId,
    draft: opts.draft,
    timeSpentMs: Date.now() - opts.startedAt,
  })
  if (!input) return
  fireProgressSave({
    kind: 'answer',
    sessionId: opts.sessionId,
    input,
    onSuccess: opts.onSuccess,
    onMappedError: opts.onMappedError,
  })
}
