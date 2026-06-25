import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { DialogFillReport } from './dialog-fill-report'
import { OptionsList } from './options-list'
import { OrderingReport } from './ordering-report'
import { ShortAnswerReport } from './short-answer-report'

// Renders the per-type answer body for one report question, narrowing the
// discriminated union to the matching sub-renderer (MC / short_answer /
// dialog_fill / ordering). Every type is dispatched by an explicit guard — no
// fall-through — so a new variant cannot be silently rendered as another type.
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
  return (
    <DialogFillReport
      blanks={question.blanks}
      correctCount={question.correctCount}
      totalBlanks={question.totalBlanks}
    />
  )
}
