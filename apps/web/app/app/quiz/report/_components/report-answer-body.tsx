import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { DiagramLabelReport } from './diagram-label-report'
import { DialogFillReport } from './dialog-fill-report'
import { OptionsList } from './options-list'
import { OrderingReport } from './ordering-report'
import { ShortAnswerReport } from './short-answer-report'

// Renders the per-type answer body for one report question, narrowing the
// discriminated union to the matching sub-renderer (MC / short_answer /
// ordering / dialog_fill / diagram_label). Each variant has its own explicit
// guard; the trailing `never` exhaustiveness check causes a compile-time error
// if a future QuizReportQuestion variant is added without a matching branch.
export function ReportAnswerBody({ question }: Readonly<{ question: QuizReportQuestion }>) {
  if (question.questionType === 'multiple_choice') {
    return (
      <OptionsList
        options={question.options}
        correctOptionId={question.correctOptionId}
        selectedOptionId={question.selectedOptionId}
      />
    )
  }
  if (question.questionType === 'short_answer') {
    return (
      <ShortAnswerReport
        responseText={question.responseText}
        canonicalAnswer={question.canonicalAnswer}
        isCorrect={question.isCorrect}
      />
    )
  }
  if (question.questionType === 'ordering') {
    return (
      <OrderingReport
        slots={question.slots}
        correctCount={question.correctCount}
        totalItems={question.totalItems}
      />
    )
  }
  if (question.questionType === 'dialog_fill') {
    return (
      <DialogFillReport
        blanks={question.blanks}
        correctCount={question.correctCount}
        totalBlanks={question.totalBlanks}
      />
    )
  }
  if (question.questionType === 'diagram_label') {
    return (
      <DiagramLabelReport
        zones={question.zones}
        correctCount={question.correctCount}
        totalZones={question.totalZones}
      />
    )
  }
  const _exhaustive: never = question
  return _exhaustive
}
