import { AnswerOptions } from '@/app/app/_components/answer-options'
import { QuestionCard } from '@/app/app/_components/question-card'
import type { QuestionTab } from '../../_components/question-tabs'
import type { QuizState } from '../_hooks/use-quiz-state'
import { DialogFillInput } from './dialog-fill-input'
import { QuizTabContent } from './quiz-tab-content'
import { ShortAnswerInput } from './short-answer-input'

type QuizMainPanelProps = {
  s: QuizState
  activeTab: QuestionTab
  userId: string
  onSelectionChange?: (id: string | null) => void
  keyboardHighlightedId?: string | null
}

function AnswerInput({
  s,
  onSelectionChange,
  keyboardHighlightedId,
}: Pick<QuizMainPanelProps, 's' | 'onSelectionChange' | 'keyboardHighlightedId'>) {
  if (!s.question) return null
  const feedback = s.currentFeedback

  if (s.question.question_type === 'short_answer') {
    const fb = feedback?.questionType === 'short_answer' ? feedback : null
    return (
      <ShortAnswerInput
        key={s.question.id}
        onSubmit={s.handleTextAnswer}
        disabled={s.submitting}
        submitting={s.answering}
        submittedText={s.existingAnswer?.responseText ?? null}
        isCorrect={fb?.isCorrect ?? null}
        correctAnswer={fb?.correctAnswer ?? null}
      />
    )
  }

  if (s.question.question_type === 'dialog_fill') {
    const fb = feedback?.questionType === 'dialog_fill' ? feedback : null
    return (
      <DialogFillInput
        key={s.question.id}
        template={s.question.dialog_template ?? ''}
        onSubmit={s.handleDialogFillAnswer}
        disabled={s.submitting}
        submitting={s.answering}
        submitted={s.existingAnswer != null}
        blanks={fb?.blanks}
      />
    )
  }

  // multiple_choice
  const fb = feedback?.questionType === 'multiple_choice' ? feedback : null
  return (
    <AnswerOptions
      key={s.question.id}
      options={s.question.options}
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

export function QuizMainPanel({
  s,
  activeTab,
  userId,
  onSelectionChange,
  keyboardHighlightedId,
}: Readonly<QuizMainPanelProps>) {
  if (!s.question) return null

  if (activeTab !== 'question') {
    return (
      <QuizTabContent
        activeTab={activeTab}
        questionId={s.questionId}
        existingAnswer={s.existingAnswer}
        explanationText={s.question.explanation_text}
        explanationImageUrl={s.question.explanation_image_url}
        userId={userId}
      />
    )
  }

  return (
    <div className="space-y-4">
      <QuestionCard
        questionText={s.question.question_text}
        questionImageUrl={s.question.question_image_url}
      />
      {s.error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {s.error}
        </div>
      )}
      <AnswerInput
        s={s}
        onSelectionChange={onSelectionChange}
        keyboardHighlightedId={keyboardHighlightedId}
      />
    </div>
  )
}
