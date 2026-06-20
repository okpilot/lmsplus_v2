import type { AnswerState } from '../_hooks/use-vfr-rt-answers'

export type VfrRtAnswerEntry =
  | { questionId: string; selectedOptionId: string }
  | { questionId: string; responseText: string }
  | { questionId: string; blankIndex: number; responseText: string }

type PayloadQuestion = { id: string; question_type: string }

export function buildVfrRtPayload(
  questions: PayloadQuestion[],
  answers: Record<string, AnswerState>,
): VfrRtAnswerEntry[] {
  const entries: VfrRtAnswerEntry[] = []

  for (const question of questions) {
    const answer = answers[question.id]
    if (!answer) continue

    if (question.question_type === 'multiple_choice') {
      if (answer.mc) entries.push({ questionId: question.id, selectedOptionId: answer.mc })
      continue
    }

    if (question.question_type === 'short_answer') {
      const short = answer.short?.trim()
      if (short) entries.push({ questionId: question.id, responseText: short })
      continue
    }

    if (question.question_type === 'dialog_fill') {
      for (const [blankIndex, text] of Object.entries(answer.blanks ?? {})) {
        const trimmed = text.trim()
        if (trimmed) {
          entries.push({
            questionId: question.id,
            blankIndex: Number(blankIndex),
            responseText: trimmed,
          })
        }
      }
    }
  }

  return entries
}
