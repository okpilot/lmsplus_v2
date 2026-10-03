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
    saveAnswer(draft: Omit<DraftAnswer, 'responseTimeMs'>) {
      const question = currentQuestion()
      if (!enabled || !question) return
      sendAnswerSave({ ...base, questionId: question.id, draft, startedAt: visitStartedAt() })
    },
  }
}
