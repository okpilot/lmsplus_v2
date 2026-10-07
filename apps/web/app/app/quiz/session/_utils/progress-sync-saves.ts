import type { DraftAnswer } from '../../types'
import {
  buildAnswerInput,
  buildPositionInput,
  fireProgressSave,
  type SaveOutcome,
} from './progress-save'
import { getQuizDeviceId } from './quiz-device-id'
import { failedAnswers, settleAnswerSend, trackAnswerSend } from './unsaved-answers'

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
  void fireProgressSave({
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

/** Fires the background answer save and resolves its outcome; a draft carrying no answer saves nothing. */
export function sendAnswerSave(opts: AnswerSaveOpts): Promise<SaveOutcome | undefined> {
  const input = buildAnswerInput({
    sessionId: opts.sessionId,
    deviceId: getQuizDeviceId(),
    questionId: opts.questionId,
    draft: opts.draft,
    timeSpentMs: Date.now() - opts.startedAt,
  })
  if (!input) return Promise.resolve(undefined)
  const { sessionId, questionId } = opts
  trackAnswerSend({ sessionId, questionId, input })
  return fireProgressSave({
    kind: 'answer',
    sessionId,
    input,
    onSuccess: opts.onSuccess,
    onMappedError: opts.onMappedError,
  }).then((outcome) => {
    settleAnswerSend({ sessionId, questionId, input, settled: outcome !== 'failed' })
    return outcome
  })
}

/** Re-sends the answer saves that failed; true when none is left unsaved. */
export async function resendUnsavedAnswers(opts: {
  sessionId: string
  onMappedError: (message: string) => void
  /** Called with the question id of each re-sent answer the server rejected for good. */
  onRejected?: (questionId: string) => void
}): Promise<boolean> {
  const { sessionId } = opts
  await Promise.all(
    failedAnswers(sessionId).map(async ({ questionId, input }) => {
      trackAnswerSend({ sessionId, questionId, input })
      const outcome = await fireProgressSave({
        kind: 'answer',
        sessionId,
        input,
        onSuccess: () => {},
        onMappedError: opts.onMappedError,
      })
      settleAnswerSend({ sessionId, questionId, input, settled: outcome !== 'failed' })
      if (outcome === 'rejected') opts.onRejected?.(questionId)
    }),
  )
  return failedAnswers(sessionId).length === 0
}

type RunnerSaveDeps = SaveHandlers & {
  sessionId: string
  /** False for Discovery, which saves nothing. */
  enabled: boolean
  /** The question on screen; it is the one being left by a position save. */
  currentQuestion: () => { id: string } | undefined
  visitStartedAt: () => number
}

/** The quiz runner's position and answer saves. */
export function buildRunnerSaves(deps: RunnerSaveDeps) {
  const { enabled, currentQuestion, visitStartedAt, ...base } = deps
  return {
    savePosition(target: number, pins: Set<string>, leaving: boolean) {
      if (!enabled) return
      const left = currentQuestion()
      const visit =
        leaving && left ? { questionId: left.id, startedAt: visitStartedAt() } : undefined
      sendPositionSave({ ...base, target, pins, leaving: visit })
    },
    saveAnswer(draft: Omit<DraftAnswer, 'responseTimeMs'>): Promise<SaveOutcome | undefined> {
      const question = currentQuestion()
      if (!enabled || !question) return Promise.resolve(undefined)
      return sendAnswerSave({
        ...base,
        questionId: question.id,
        draft,
        startedAt: visitStartedAt(),
      })
    },
  }
}
