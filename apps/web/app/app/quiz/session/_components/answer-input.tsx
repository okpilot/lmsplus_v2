import { AnswerOptions } from '@/app/app/_components/answer-options'
import type { QuizState } from '../_hooks/use-quiz-state'
import { DialogFillInput } from './dialog-fill-input'
import { OrderingInput } from './ordering-input'
import { ShortAnswerInput } from './short-answer-input'

type Question = NonNullable<QuizState['question']>

type AnswerInputProps = {
  s: QuizState
  onSelectionChange?: (id: string | null) => void
  keyboardHighlightedId?: string | null
}

function ShortAnswerAnswer({ s, question }: { s: QuizState; question: Question }) {
  const fb = s.currentFeedback?.questionType === 'short_answer' ? s.currentFeedback : null
  return (
    <ShortAnswerInput
      key={question.id}
      onSubmit={s.handleTextAnswer}
      disabled={s.submitting}
      submitting={s.answering}
      submittedText={s.existingAnswer?.responseText ?? null}
      isCorrect={fb?.isCorrect ?? null}
      correctAnswer={fb?.correctAnswer ?? null}
    />
  )
}

function DialogFillAnswer({ s, question }: { s: QuizState; question: Question }) {
  const fb = s.currentFeedback?.questionType === 'dialog_fill' ? s.currentFeedback : null
  return (
    <DialogFillInput
      key={question.id}
      template={question.dialog_template ?? ''}
      onSubmit={s.handleDialogFillAnswer}
      disabled={s.submitting}
      submitting={s.answering}
      submitted={s.existingAnswer != null}
      blanks={fb?.blanks}
    />
  )
}

function OrderingAnswer({ s, question }: { s: QuizState; question: Question }) {
  const fb = s.currentFeedback?.questionType === 'ordering' ? s.currentFeedback : null
  // Defensive: an ordering question must carry ≥2 items (the invariant this control
  // renders). A null/empty/one-item payload can only arise from a data-import bug
  // (prod data is CHECK-enforced ≥2); fail closed with a refresh prompt rather than a
  // blank or nonsensical single-item drag area the student could still submit.
  const items = question.ordering_items
  if (!items || items.length < 2) {
    return (
      <div role="alert" className="text-sm text-muted-foreground">
        This question could not be loaded. Please refresh the page.
      </div>
    )
  }
  return (
    <OrderingInput
      key={question.id}
      items={items}
      onSubmit={s.handleOrderingAnswer}
      disabled={s.submitting}
      submitting={s.answering}
      submitted={s.existingAnswer != null}
      correctOrder={fb?.correctOrder}
      submittedOrder={s.existingAnswer?.order}
    />
  )
}

function McAnswer({
  s,
  question,
  onSelectionChange,
  keyboardHighlightedId,
}: AnswerInputProps & { question: Question }) {
  const fb = s.currentFeedback?.questionType === 'multiple_choice' ? s.currentFeedback : null
  return (
    <AnswerOptions
      key={question.id}
      options={question.options}
      onSubmit={s.handleSelectAnswer}
      // Options stay clickable mid-RPC (lockedRef prevents re-entry); only a
      // session submit disables them. `submitting` drives the spinner + the
      // Submit Answer button's own disabled state during the per-answer RPC.
      disabled={s.submitting}
      submitting={s.answering}
      selectedOptionId={s.existingAnswer?.selectedOptionId ?? null}
      correctOptionId={fb?.correctOptionId ?? null}
      onSelectionChange={onSelectionChange}
      isExam={s.isExam}
      keyboardHighlightedId={keyboardHighlightedId}
    />
  )
}

export function AnswerInput({ s, onSelectionChange, keyboardHighlightedId }: AnswerInputProps) {
  const question = s.question
  if (!question) return null

  if (s.isExam && question.question_type !== 'multiple_choice') {
    return (
      <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        This question type is not yet supported in exam mode.
      </div>
    )
  }

  switch (question.question_type) {
    case 'multiple_choice':
      return (
        <McAnswer
          s={s}
          question={question}
          onSelectionChange={onSelectionChange}
          keyboardHighlightedId={keyboardHighlightedId}
        />
      )
    case 'short_answer':
      return <ShortAnswerAnswer s={s} question={question} />
    case 'dialog_fill':
      return <DialogFillAnswer s={s} question={question} />
    case 'ordering':
      return <OrderingAnswer s={s} question={question} />
    default:
      // Fail closed: an unknown question_type (a future type like diagram_label not
      // yet wired, or loader drift) must not be reinterpreted as MC — that would
      // render the wrong control and submit an MC-shaped payload silently.
      return (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          This question type is not yet supported.
        </div>
      )
  }
}
