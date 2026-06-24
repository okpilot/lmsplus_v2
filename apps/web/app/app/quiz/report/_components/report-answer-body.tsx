import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { DialogFillReport } from './dialog-fill-report'
import { OptionsList } from './options-list'
import { ShortAnswerReport } from './short-answer-report'

// Renders the per-type answer body for one report question, narrowing the
// discriminated union to the matching sub-renderer (MC / short_answer / dialog_fill).
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
  return (
    <DialogFillReport
      blanks={question.blanks}
      correctCount={question.correctCount}
      totalBlanks={question.totalBlanks}
    />
  )
}

// "Answered" differs per type: MC needs a selected option present in the list;
// short_answer needs response text; dialog_fill needs at least one filled blank.
export function isQuestionAnswered(question: QuizReportQuestion): boolean {
  if (question.questionType === 'multiple_choice') {
    return question.options.some((o) => o.id === question.selectedOptionId)
  }
  if (question.questionType === 'short_answer') {
    return question.responseText !== null && question.responseText.trim().length > 0
  }
  return question.blanks.some((b) => b.responseText !== null && b.responseText.trim().length > 0)
}
