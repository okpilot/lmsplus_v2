import type { AnswerKeyEntry } from './report-question-builder'

// One row per non-MC answer key from get_report_answer_keys.
//  - short_answer:  blank_index NULL, answer_key = the canonical answer.
//  - dialog_fill:   one row per blank, blank_index set, answer_key = blank canonical.
//  - ordering:      one row per slot, blank_index = slot position, answer_key = canonical item text.
//  - diagram_label: one row per zone, blank_index = zone ordinal, answer_key = correct label text.
export type AnswerKeyRow = {
  question_id: string
  question_type: string
  blank_index: number | null
  answer_key: string | null
}

// Distinct question_ids from the answered-order rows, first-answer order preserved.
export function buildDistinctQuestionOrder(orderRows: { question_id: string }[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const r of orderRows) {
    if (seen.has(r.question_id)) continue
    seen.add(r.question_id)
    ordered.push(r.question_id)
  }
  return ordered
}

// Collapse the flat answer-key rows into a per-question map the builder consumes.
export function buildAnswerKeyMap(rows: AnswerKeyRow[]): Map<string, AnswerKeyEntry> {
  const map = new Map<string, AnswerKeyEntry>()
  for (const row of rows) {
    if (row.question_type === 'dialog_fill') {
      const existing = map.get(row.question_id)
      const entry: AnswerKeyEntry =
        existing?.type === 'dialog_fill'
          ? existing
          : { type: 'dialog_fill', canonicalByIndex: new Map<number, string>() }
      if (row.blank_index !== null && row.answer_key !== null) {
        entry.canonicalByIndex.set(row.blank_index, row.answer_key)
      }
      map.set(row.question_id, entry)
    } else if (row.question_type === 'ordering') {
      const existing = map.get(row.question_id)
      const entry: AnswerKeyEntry =
        existing?.type === 'ordering'
          ? existing
          : { type: 'ordering', canonicalBySlot: new Map<number, string>() }
      if (row.blank_index !== null && row.answer_key !== null) {
        entry.canonicalBySlot.set(row.blank_index, row.answer_key)
      }
      map.set(row.question_id, entry)
    } else if (row.question_type === 'diagram_label') {
      const existing = map.get(row.question_id)
      const entry: AnswerKeyEntry =
        existing?.type === 'diagram_label'
          ? existing
          : { type: 'diagram_label', correctLabelByZone: new Map<number, string>() }
      if (row.blank_index !== null && row.answer_key !== null) {
        entry.correctLabelByZone.set(row.blank_index, row.answer_key)
      }
      map.set(row.question_id, entry)
    } else {
      // short_answer (and any future single-key type)
      map.set(row.question_id, { type: 'short_answer', canonical: row.answer_key })
    }
  }
  return map
}
