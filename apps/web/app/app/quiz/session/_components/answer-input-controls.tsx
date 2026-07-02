// Per-question-type answer control wrappers, hoisted out of answer-input.tsx to
// keep that file under the 150-line cap (code-style.md §1) — the switch grew a
// 5th (diagram_label) arm on top of an already-at-cap file.
import { AnswerOptions } from '@/app/app/_components/answer-options'
import type { QuizState } from '../_hooks/use-quiz-state'
import { DiagramLabelInput } from './diagram-label-input'
import { DialogFillInput } from './dialog-fill-input'
import { OrderingInput } from './ordering-input'
import { ShortAnswerInput } from './short-answer-input'

export type Question = NonNullable<QuizState['question']>

type ControlProps = Readonly<{ s: QuizState; question: Question }>

// Fail-closed placeholder shared by the ordering/diagram_label controls when the
// delivered payload violates its render invariant (a data-import bug, since prod
// data is CHECK-enforced). Extracted so the two clones can't drift in wording.
function MissingConfigAlert() {
  return (
    <div role="alert" className="text-sm text-muted-foreground">
      This question could not be loaded. Please refresh the page.
    </div>
  )
}

export function ShortAnswerAnswer({ s, question }: ControlProps) {
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

export function DialogFillAnswer({ s, question }: ControlProps) {
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

export function OrderingAnswer({ s, question }: ControlProps) {
  const fb = s.currentFeedback?.questionType === 'ordering' ? s.currentFeedback : null
  // Defensive: an ordering question must carry ≥2 items (the invariant this control
  // renders). A null/empty/one-item payload can only arise from a data-import bug
  // (prod data is CHECK-enforced ≥2); fail closed with a refresh prompt rather than a
  // blank or nonsensical single-item drag area the student could still submit.
  const items = question.ordering_items
  if (!items || items.length < 2) return <MissingConfigAlert />
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

export function DiagramLabelAnswer({ s, question }: ControlProps) {
  const fb = s.currentFeedback?.questionType === 'diagram_label' ? s.currentFeedback : null
  // Defensive: a diagram_label question must carry a delivered config with at
  // least one zone and one label (the invariant this control renders). A
  // null/empty payload can only arise from a data-import bug (prod data is
  // CHECK-enforced); fail closed with a refresh prompt rather than a broken or
  // empty diagram surface the student could still submit.
  const config = question.diagram_config
  if (!config || config.zones.length === 0 || config.labels.length === 0)
    return <MissingConfigAlert />
  return (
    <DiagramLabelInput
      key={question.id}
      imageRef={config.image_ref}
      zones={config.zones}
      labels={config.labels}
      onSubmit={s.handleDiagramLabelAnswer}
      disabled={s.submitting}
      submitting={s.answering}
      submitted={s.existingAnswer != null}
      correctMapping={fb?.correctMapping}
      submittedMapping={s.existingAnswer?.mapping}
    />
  )
}

type McAnswerProps = Readonly<{
  s: QuizState
  question: Question
  onSelectionChange?: (id: string | null) => void
  keyboardHighlightedId?: string | null
}>

export function McAnswer({ s, question, onSelectionChange, keyboardHighlightedId }: McAnswerProps) {
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

export function UnsupportedQuestionType({ message }: Readonly<{ message: string }>) {
  return (
    <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {message}
    </div>
  )
}
