import type { VfrRtQuestion } from '@/lib/queries/vfr-rt-exam'
import type { AnswerState } from '../_hooks/use-vfr-rt-answers'

type Part = { label: string; n: 1 | 2 | 3 }

const PART_BY_TYPE: Record<VfrRtQuestion['question_type'], Part> = {
  short_answer: { label: 'Part 1', n: 1 },
  dialog_fill: { label: 'Part 2', n: 2 },
  multiple_choice: { label: 'Part 3', n: 3 },
}

export function partForType(type: VfrRtQuestion['question_type']): Part {
  const part = PART_BY_TYPE[type]
  // The 3-value union is exhaustive at compile time; this guards against a
  // future DB schema value reaching the client before the types are regenerated.
  if (!part) throw new Error(`[partForType] Unknown question type: ${type}`)
  return part
}

function isAnswered(question: VfrRtQuestion, answer: AnswerState | undefined): boolean {
  if (!answer) return false
  if (question.question_type === 'short_answer') return Boolean(answer.short?.trim())
  if (question.question_type === 'multiple_choice') return Boolean(answer.mc)
  return Object.values(answer.blanks ?? {}).some((t) => t.trim())
}

export type PartSegment = { label: string; answered: number; total: number }

export function buildPartSegments(
  questions: VfrRtQuestion[],
  answers: Record<string, AnswerState>,
): PartSegment[] {
  const types: VfrRtQuestion['question_type'][] = ['short_answer', 'dialog_fill', 'multiple_choice']
  return types.map((type) => {
    const inPart = questions.filter((q) => q.question_type === type)
    const answered = inPart.filter((q) => isAnswered(q, answers[q.id])).length
    return { label: partForType(type).label, answered, total: inPart.length }
  })
}
