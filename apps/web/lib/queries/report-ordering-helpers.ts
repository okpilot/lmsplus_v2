import type {
  OrderingSlotResult,
  QuizReportQuestion,
  QuizReportQuestionCommon,
} from './quiz-report'
import type { AnswerKeyEntry, AnswerRow } from './report-question-builder'

// Resolve the slot order to render. Drive the slot set from the question's full
// canonical order — get_report_answer_keys (mig 149) returns every ordering_items
// entry — so an omitted slot still renders as unanswered (responseText null,
// isCorrect false). This matches batch_submit_quiz (mig 148), which scores ordering
// questions against the canonical item count, NOT the submitted-row count. Fall back
// to the submitted rows only when no answer keys are present (all-MC session, or a
// keyless race) — preserves prior behavior.
function resolveSlotIndices(
  canonicalBySlot: Map<number, string>,
  rowBySlot: Map<number, AnswerRow>,
): number[] {
  return canonicalBySlot.size > 0
    ? [...canonicalBySlot.keys()].sort((a, b) => a - b)
    : [...rowBySlot.keys()].sort((a, b) => a - b)
}

export function buildOrdering(
  common: QuizReportQuestionCommon,
  rows: AnswerRow[],
  key: AnswerKeyEntry | undefined,
): QuizReportQuestion {
  const canonicalBySlot = key?.type === 'ordering' ? key.canonicalBySlot : new Map<number, string>()
  // Ordering rows always carry a non-null blank_index (per-slot storage, enforced
  // by the mig-135 trigger). Filter any null-index row out rather than coercing it
  // to slot 0 — a stray row must not overwrite the real first slot; the canonical
  // path below still renders the missing slot as unanswered.
  const rowBySlot = new Map(
    rows
      .filter((r): r is AnswerRow & { blank_index: number } => r.blank_index != null)
      .map((r) => [r.blank_index, r]),
  )
  const slotIndices = resolveSlotIndices(canonicalBySlot, rowBySlot)
  const slots: OrderingSlotResult[] = slotIndices.map((position) => {
    const row = rowBySlot.get(position)
    return {
      position,
      responseText: row?.response_text ?? null,
      canonicalText: canonicalBySlot.get(position) ?? null,
      isCorrect: row?.is_correct ?? false,
    }
  })

  const correctCount = slots.filter((s) => s.isCorrect).length
  return {
    ...common,
    questionType: 'ordering',
    isCorrect: slots.length > 0 && correctCount === slots.length,
    slots,
    correctCount,
    totalItems: slots.length,
  }
}
