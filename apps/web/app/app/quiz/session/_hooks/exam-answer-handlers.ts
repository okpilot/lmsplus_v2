import type { DraftAnswer } from '../../types'

type RecordAnswer = (draft: Omit<DraftAnswer, 'responseTimeMs'>) => boolean

/**
 * Exam-mode answer handlers: each buffers the answer write-once (no server
 * call, no feedback) and checkpoints when recorded. Names and signatures match
 * the study pipeline's handlers (answer-handler-helpers.ts).
 */
export function buildExamAnswerHandlers(deps: {
  recordAnswer: RecordAnswer
  checkpoint: () => void
}) {
  const { recordAnswer, checkpoint } = deps

  function record(draft: Omit<DraftAnswer, 'responseTimeMs'>): Promise<boolean> {
    const recorded = recordAnswer(draft)
    if (recorded) checkpoint()
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
