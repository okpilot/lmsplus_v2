import type { QuizState } from '../_hooks/use-quiz-state'
import {
  DiagramLabelAnswer,
  DialogFillAnswer,
  McAnswer,
  OrderingAnswer,
  type Question,
  ShortAnswerAnswer,
  UnsupportedQuestionType,
} from './answer-input-controls'

type AnswerInputProps = {
  s: QuizState
  onSelectionChange?: (id: string | null) => void
  keyboardHighlightedId?: string | null
}

function AnswerControl(props: AnswerInputProps & { question: Question }) {
  const { s, question } = props

  if (s.isExam && question.question_type !== 'multiple_choice') {
    return (
      <UnsupportedQuestionType message="This question type is not yet supported in exam mode." />
    )
  }

  switch (question.question_type) {
    case 'multiple_choice':
      return <McAnswer {...props} />
    case 'short_answer':
      return <ShortAnswerAnswer s={s} question={question} />
    case 'dialog_fill':
      return <DialogFillAnswer s={s} question={question} />
    case 'ordering':
      return <OrderingAnswer s={s} question={question} />
    case 'diagram_label':
      return <DiagramLabelAnswer s={s} question={question} />
    default:
      // Fail closed: an unknown question_type (loader drift) must not be
      // reinterpreted as MC — that would render the wrong control and submit
      // an MC-shaped payload silently.
      return <UnsupportedQuestionType message="This question type is not yet supported." />
  }
}

export function AnswerInput(props: AnswerInputProps) {
  const question = props.s.question
  if (!question) return null
  return <AnswerControl {...props} question={question} />
}
