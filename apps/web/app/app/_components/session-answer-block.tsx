import type { AnswerResult, SessionState } from '../_types/session'
import { AnswerOptions } from './answer-options'
import { FeedbackPanel } from './feedback-panel'

type SessionAnswerBlockProps = {
  options: { id: string; text: string }[]
  onSubmit: (selectedId: string) => void
  submitting: boolean
  state: SessionState
  feedbackData: Extract<AnswerResult, { success: true }> | null
  selectedOption: string | null
  onNext: () => void
}

export function SessionAnswerBlock({
  options,
  onSubmit,
  submitting,
  state,
  feedbackData,
  selectedOption,
  onNext,
}: SessionAnswerBlockProps) {
  return (
    <>
      <AnswerOptions
        options={options}
        onSubmit={onSubmit}
        disabled={submitting || state === 'feedback'}
        correctOptionId={feedbackData?.correctOptionId}
        selectedOptionId={selectedOption}
      />
      {state === 'feedback' && feedbackData && (
        <FeedbackPanel
          isCorrect={feedbackData.isCorrect}
          explanationText={feedbackData.explanationText}
          explanationImageUrl={feedbackData.explanationImageUrl}
          onNext={onNext}
        />
      )}
    </>
  )
}
