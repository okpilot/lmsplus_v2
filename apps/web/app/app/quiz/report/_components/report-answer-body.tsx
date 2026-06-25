import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { DialogFillReport } from './dialog-fill-report'
import { OptionsList } from './options-list'
import { OrderingReport } from './ordering-report'
import { ShortAnswerReport } from './short-answer-report'

// Renders the per-type answer body for one report question, narrowing the
// discriminated union to the matching sub-renderer (MC / short_answer /
// ordering / dialog_fill). Each of the four variants has its own explicit
// guard; the trailing `return null` is an unreachable safety net so a future
// variant renders nothing rather than being silently mis-rendered as another
// type.
export function ReportAnswerBody({ question }: { question: QuizReportQuestion }) {
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
  return null
}
