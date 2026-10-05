import type { DiagramMappingEntry } from '@/app/app/quiz/actions/diagram-validation'
import { clampIndex } from '@/app/app/quiz/session/_utils/clamp-index'
import type { DraftAnswer } from '@/app/app/quiz/types'

export type ProgressRow = { question_id: string; answer: unknown; time_spent_ms: number }

export type SessionSeed = {
  answers: Record<string, DraftAnswer>
  /** Sum of every question's saved visit time, viewed-only questions included. */
  activeMs: number
  pinnedQuestionIds: string[]
  currentIndex: number
}

type SeedInput = {
  rows: readonly ProgressRow[]
  questionIds: readonly string[]
  pinnedQuestionIds: readonly string[]
  currentIndex: number
}

type AnswerBody = Omit<DraftAnswer, 'responseTimeMs'>

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function toBlanks(v: unknown): AnswerBody['blankAnswers'] | null {
  if (!Array.isArray(v)) return null
  const out: { index: number; text: string }[] = []
  for (const b of v) {
    if (!isRecord(b) || typeof b.blank_index !== 'number' || typeof b.response_text !== 'string') {
      return null
    }
    out.push({ index: b.blank_index, text: b.response_text })
  }
  return out
}

function toMapping(v: unknown): DiagramMappingEntry[] | null {
  if (!Array.isArray(v)) return null
  const out: DiagramMappingEntry[] = []
  for (const m of v) {
    if (!isRecord(m) || typeof m.zone_id !== 'string' || typeof m.label_id !== 'string') return null
    out.push({ zoneId: m.zone_id, labelId: m.label_id })
  }
  return out
}

/** Inverse of toAnswerJson (quiz-progress-helpers): the stored jsonb back to a draft; null when unrecognised. */
export function fromAnswerJson(a: unknown): AnswerBody | null {
  if (!isRecord(a)) return null
  if (typeof a.selected_option_id === 'string' && /^[a-d]$/.test(a.selected_option_id)) {
    return { selectedOptionId: a.selected_option_id }
  }
  if (typeof a.response_text === 'string') return { responseText: a.response_text }
  if ('blanks' in a) {
    const blankAnswers = toBlanks(a.blanks)
    return blankAnswers ? { blankAnswers } : null
  }
  if (Array.isArray(a.order) && a.order.every((x) => typeof x === 'string')) {
    return { order: a.order as string[] }
  }
  if ('mapping' in a) {
    const mapping = toMapping(a.mapping)
    return mapping ? { mapping } : null
  }
  return null
}

/** Maps the saved progress of a session into the runner's initial state. */
export function buildSessionSeed(input: SeedInput): SessionSeed {
  const inSession = new Set(input.questionIds)
  const answers: Record<string, DraftAnswer> = {}
  let activeMs = 0
  for (const row of input.rows) {
    if (!inSession.has(row.question_id)) continue
    activeMs += row.time_spent_ms
    const body = fromAnswerJson(row.answer)
    if (body) answers[row.question_id] = { ...body, responseTimeMs: row.time_spent_ms }
  }
  return {
    answers,
    activeMs,
    pinnedQuestionIds: input.pinnedQuestionIds.filter((id) => inSession.has(id)),
    currentIndex: clampIndex(input.currentIndex, input.questionIds.length),
  }
}
