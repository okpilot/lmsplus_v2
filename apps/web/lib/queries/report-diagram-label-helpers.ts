import type { QuizReportQuestion, QuizReportQuestionCommon } from './quiz-report'
import type { DiagramZoneResult } from './quiz-report-diagram-types'
import type { AnswerKeyEntry, AnswerRow } from './report-question-builder'

// Resolve the zone order to render. Drive the zone set from the question's full
// diagram_config.zones — get_report_answer_keys (mig 156) returns every zone —
// so an omitted zone still renders as unplaced (placedLabel null, isCorrect
// false). This matches batch_submit_quiz (mig 155), which scores diagram_label
// questions against the config's total zone count, NOT the submitted-row
// count. Fall back to the submitted rows only when no answer keys are present
// (an all-MC session, or a keyless race) — preserves prior behavior (mirrors
// resolveSlotIndices in report-ordering-helpers.ts).
function resolveZoneIndices(
  correctLabelByZone: Map<number, string>,
  rowByZone: Map<number, AnswerRow>,
): number[] {
  return correctLabelByZone.size > 0
    ? [...correctLabelByZone.keys()].sort((a, b) => a - b)
    : [...rowByZone.keys()].sort((a, b) => a - b)
}

export function buildDiagram(
  common: QuizReportQuestionCommon,
  rows: AnswerRow[],
  key: AnswerKeyEntry | undefined,
): QuizReportQuestion {
  const correctLabelByZone =
    key?.type === 'diagram_label' ? key.correctLabelByZone : new Map<number, string>()
  // diagram_label rows always carry a non-null blank_index — the derived zone
  // ordinal from _grade_record_diagram_label (mig 154), the SAME index
  // get_report_answer_keys (mig 156) uses. Filter any null-index row out
  // rather than coercing it to zone 0 — a stray row must not overwrite the
  // real first zone; the canonical path below still renders the missing zone
  // as unplaced.
  const rowByZone = new Map(
    rows
      .filter((r): r is AnswerRow & { blank_index: number } => r.blank_index != null)
      .map((r) => [r.blank_index, r]),
  )
  const zoneIndices = resolveZoneIndices(correctLabelByZone, rowByZone)
  const zones: DiagramZoneResult[] = zoneIndices.map((blankIndex) => {
    const row = rowByZone.get(blankIndex)
    return {
      blankIndex,
      // response_text stores the placed LABEL TEXT (mig 154), not a zone/label id.
      placedLabel: row?.response_text ?? null,
      correctLabel: correctLabelByZone.get(blankIndex) ?? '',
      isCorrect: row?.is_correct ?? false,
    }
  })

  const correctCount = zones.filter((z) => z.isCorrect).length
  return {
    ...common,
    questionType: 'diagram_label',
    isCorrect: zones.length > 0 && correctCount === zones.length,
    zones,
    correctCount,
    totalZones: zones.length,
  }
}
