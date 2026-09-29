import type { z } from 'zod'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { DraftAnswer } from '@/app/app/quiz/types'
import { AnswerEntry } from '../actions/_answer-mapping'

type Entry = z.infer<typeof AnswerEntry>

function distinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function isMcOptionId(id: string | undefined): id is 'a' | 'b' | 'c' | 'd' {
  return id === 'a' || id === 'b' || id === 'c' || id === 'd'
}

function mcEntries(q: SessionQuestion, a: DraftAnswer): Entry[] | null {
  const id = a.selectedOptionId
  if (!isMcOptionId(id) || !q.options.some((o) => o.id === id)) return null
  return [{ questionId: q.id, selectedOptionId: id, responseTimeMs: a.responseTimeMs }]
}

function shortEntries(q: SessionQuestion, a: DraftAnswer): Entry[] | null {
  if (typeof a.responseText !== 'string' || a.responseText.trim() === '') return null
  return [{ questionId: q.id, responseText: a.responseText, responseTimeMs: a.responseTimeMs }]
}

function dialogEntries(q: SessionQuestion, a: DraftAnswer): Entry[] | null {
  const blanks = a.blankAnswers
  if (!Array.isArray(blanks) || blanks.length === 0) return null
  const allowed = new Set((q.blanks_safe ?? []).map((b) => b.index))
  if (!blanks.every((b) => allowed.has(b.index))) return null
  if (!distinct(blanks.map((b) => String(b.index)))) return null
  return blanks.map((b) => ({
    questionId: q.id,
    blankIndex: b.index,
    responseText: b.text,
    responseTimeMs: a.responseTimeMs,
  }))
}

function orderingEntries(q: SessionQuestion, a: DraftAnswer): Entry[] | null {
  const order = a.order
  const items = q.ordering_items
  if (!Array.isArray(order) || !items || items.length === 0) return null
  if (order.length !== items.length || !distinct(order)) return null
  const delivered = new Set(items.map((i) => i.id))
  if (!order.every((id) => delivered.has(id))) return null
  return order.map((id, i) => ({
    questionId: q.id,
    selectedOptionId: id,
    blankIndex: i,
    responseTimeMs: a.responseTimeMs,
  }))
}

function diagramEntries(q: SessionQuestion, a: DraftAnswer): Entry[] | null {
  const mapping = a.mapping
  const config = q.diagram_config
  if (!Array.isArray(mapping) || mapping.length === 0 || !config) return null
  const zones = new Set(config.zones.map((z) => z.id))
  const labels = new Set(config.labels.map((l) => l.id))
  if (!mapping.every((m) => zones.has(m.zoneId) && labels.has(m.labelId))) return null
  if (!distinct(mapping.map((m) => m.zoneId))) return null
  if (!distinct(mapping.map((m) => m.labelId))) return null
  return mapping.map((m, i) => ({
    questionId: q.id,
    selectedOptionId: m.labelId,
    responseText: m.zoneId,
    blankIndex: i,
    responseTimeMs: a.responseTimeMs,
  }))
}

const BUILDERS: Record<
  SessionQuestion['question_type'],
  (q: SessionQuestion, a: DraftAnswer) => Entry[] | null
> = {
  multiple_choice: mcEntries,
  short_answer: shortEntries,
  dialog_fill: dialogEntries,
  ordering: orderingEntries,
  diagram_label: diagramEntries,
}

/**
 * Sanitises a VFR RT exam's answers so `submit_vfr_rt_exam_answers` cannot reject the
 * whole payload. The question type comes from the delivered question, never the answer
 * shape. A question whose answer would be rejected is dropped entirely; grading stays
 * server-side.
 */
export function buildVfrRtExamPayload(
  answers: Map<string, DraftAnswer>,
  questions: readonly SessionQuestion[],
): Entry[] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const payload: Entry[] = []
  for (const [questionId, answer] of answers) {
    const question = byId.get(questionId)
    if (!question) continue
    const entries = BUILDERS[question.question_type](question, answer)
    if (entries === null) continue
    if (!entries.every((e) => AnswerEntry.safeParse(e).success)) continue
    payload.push(...entries)
  }
  return payload
}
