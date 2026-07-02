import type { QuizReportQuestion } from './quiz-report'

function hasText(value: string | null): boolean {
  return value !== null && value.trim().length > 0
}

// "Answered" differs per type: MC needs a selected option present in the list;
// short_answer needs response text; dialog_fill needs at least one filled blank;
// ordering needs at least one slot with a placed item; diagram_label needs at
// least one zone with a placed label. The trailing `never` exhaustiveness
// check (mirrors ReportAnswerBody) causes a compile-time error if a future
// QuizReportQuestion variant is added without a matching branch here.
export function isQuestionAnswered(question: QuizReportQuestion): boolean {
  if (question.questionType === 'multiple_choice') {
    return question.options.some((o) => o.id === question.selectedOptionId)
  }
  if (question.questionType === 'short_answer') {
    return hasText(question.responseText)
  }
  if (question.questionType === 'ordering') {
    // response_text is the resolved item text — always non-empty per
    // _grade_record_ordering's guard (it throws on empty/null before INSERT).
    return question.slots.some((s) => hasText(s.responseText))
  }
  if (question.questionType === 'diagram_label') {
    // placedLabel is the resolved label text — always non-empty per
    // _grade_record_diagram_label's guard (it throws on empty/null before INSERT).
    return question.zones.some((z) => hasText(z.placedLabel))
  }
  if (question.questionType === 'dialog_fill') {
    return question.blanks.some((b) => hasText(b.responseText))
  }
  const _exhaustive: never = question
  return _exhaustive
}
