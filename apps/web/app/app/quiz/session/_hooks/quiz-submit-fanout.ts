// Fan-out helpers: expand a per-question DraftAnswer into the flat
// AnswerEntry[] shape batch_submit_quiz's dispatcher RPC expects. Hoisted out
// of quiz-submit.ts (already at/over its 200-line cap — code-style.md §1) as
// the fan-out logic grew a 3rd (diagram_label) branch.
import type { DraftAnswer } from '../../types'

export type AnswerEntry = {
  questionId: string
  selectedOptionId?: string
  responseText?: string
  blankIndex?: number
  responseTimeMs: number
}

// ordering: one entry per slot — item id rides in selectedOptionId, the slot
// position in blankIndex (the batch_submit dispatcher reads them per slot).
function fanOutOrderingAnswer(questionId: string, a: DraftAnswer): AnswerEntry[] {
  return (a.order ?? []).map((id, i) => ({
    questionId,
    selectedOptionId: id,
    blankIndex: i,
    responseTimeMs: a.responseTimeMs,
  }))
}

// diagram_label: one entry per PLACED zone. INVERTED vs intuition — the LABEL
// id rides in selectedOptionId, the ZONE id rides in responseText. The
// dispatcher RPC (mig 155) self-defends on DISTINCT response_text (zone) +
// DISTINCT selected_option (label) and derives the true blank_index
// server-side; the client blankIndex only needs to be a distinct int per
// entry to satisfy the upstream (question_id, blank_index) dup-guard — the
// placement index suffices. Only placed zones produce entries (partial
// submission is valid).
function fanOutDiagramLabelAnswer(questionId: string, a: DraftAnswer): AnswerEntry[] {
  return (a.mapping ?? []).map((m, i) => ({
    questionId,
    selectedOptionId: m.labelId,
    responseText: m.zoneId,
    blankIndex: i,
    responseTimeMs: a.responseTimeMs,
  }))
}

export function fanOutAnswer(questionId: string, a: DraftAnswer): AnswerEntry[] {
  if (a.blankAnswers && a.blankAnswers.length > 0) {
    // dialog_fill: fan out one entry per blank
    return a.blankAnswers.map((b) => ({
      questionId,
      blankIndex: b.index,
      responseText: b.text,
      responseTimeMs: a.responseTimeMs,
    }))
  }
  if (a.responseText !== undefined) {
    // short_answer: single entry with responseText
    return [{ questionId, responseText: a.responseText, responseTimeMs: a.responseTimeMs }]
  }
  // diagram_label: any array (including empty) is a diagram_label answer —
  // route it here, before the ordering/MC branches, so a partial or empty
  // mapping fans out to the correct entry count rather than falling through.
  if (Array.isArray(a.mapping)) return fanOutDiagramLabelAnswer(questionId, a)
  // ordering: any array (including empty) is an ordering answer — route it here so
  // an empty order produces zero entries rather than falling through to the MC
  // default and emitting a bogus `{ selectedOptionId: undefined }`.
  if (Array.isArray(a.order)) return fanOutOrderingAnswer(questionId, a)
  // MC (default): single entry with selectedOptionId
  return [{ questionId, selectedOptionId: a.selectedOptionId, responseTimeMs: a.responseTimeMs }]
}
