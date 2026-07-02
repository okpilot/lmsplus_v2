import type { QuizReportQuestion } from './quiz-report'

// "Answered" differs per type: MC needs a selected option present in the list;
// short_answer needs response text; dialog_fill needs at least one filled blank;
// ordering needs at least one slot with a placed item; diagram_label needs at
// least one zone with a placed label.
export function isQuestionAnswered(question: QuizReportQuestion): boolean {
  if (question.questionType === 'multiple_choice') {
    return question.options.some((o) => o.id === question.selectedOptionId)
  }
  if (question.questionType === 'short_answer') {
    return question.responseText !== null && question.responseText.trim().length > 0
  }
  if (question.questionType === 'ordering') {
    // response_text is the resolved item text — always non-empty per
    // _grade_record_ordering's guard (it throws on empty/null before INSERT).
    return question.slots.some((s) => s.responseText !== null && s.responseText.trim().length > 0)
  }
  if (question.questionType === 'diagram_label') {
    // placedLabel is the resolved label text — always non-empty per
    // _grade_record_diagram_label's guard (it throws on empty/null before INSERT).
    return question.zones.some((z) => z.placedLabel !== null && z.placedLabel.trim().length > 0)
  }
  return question.blanks.some((b) => b.responseText !== null && b.responseText.trim().length > 0)
}
