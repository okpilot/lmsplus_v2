import type { DraftAnswer } from '../../types'
import type { SaveOutcome } from '../_utils/progress-save'
import type { useQuizSubmit } from './use-quiz-submit'

type RecordAnswer = (draft: Omit<DraftAnswer, 'responseTimeMs'>) => boolean

/**
 * Exam-mode answer handlers: each buffers the answer write-once (no server
 * call, no feedback) and reports it when recorded; a rejected save unlocks it. Names and signatures match
 * the study pipeline's handlers (answer-handler-helpers.ts).
 */
export function buildExamAnswerHandlers(deps: {
  recordAnswer: RecordAnswer
  getQuestionId: () => string
  dropAnswer: (questionId: string) => void
  onRecorded?: (draft: Omit<DraftAnswer, 'responseTimeMs'>) => Promise<SaveOutcome | undefined>
}) {
  const { recordAnswer, getQuestionId, dropAnswer, onRecorded } = deps

  function record(draft: Omit<DraftAnswer, 'responseTimeMs'>): Promise<boolean> {
    const questionId = getQuestionId()
    const recorded = recordAnswer(draft)
    if (recorded) {
      void Promise.resolve(onRecorded?.(draft)).then((outcome) => {
        if (outcome === 'rejected') dropAnswer(questionId)
      })
    }
    return Promise.resolve(recorded)
  }

  return {
    handleSelectAnswer: (optionId: string) => record({ selectedOptionId: optionId }),
    handleTextAnswer: (text: string) => record({ responseText: text }),
    handleDialogFillAnswer: (blankAnswers: { index: number; text: string }[]) =>
      record({ blankAnswers }),
    handleOrderingAnswer: (order: string[]) => record({ order }),
    handleDiagramLabelAnswer: (mapping: { zoneId: string; labelId: string }[]) =>
      mapping.length === 0 ? Promise.resolve(false) : record({ mapping }),
  }
}

/** The submit/save/discard surface of the exam pipeline, picked from useQuizSubmit's result. */
export function pickExamSubmitControls(submit: ReturnType<typeof useQuizSubmit>) {
  return {
    submitted: submit.submitted,
    error: submit.error,
    submitting: submit.submitting,
    pendingAction: submit.pendingAction,
    handleSubmit: submit.handleSubmit,
    handleSave: submit.handleSave,
    handleDiscard: submit.handleDiscard,
    showFinishDialog: submit.showFinishDialog,
    setShowFinishDialog: submit.setShowFinishDialog,
  }
}
