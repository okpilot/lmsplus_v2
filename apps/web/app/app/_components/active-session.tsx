import type { AnswerResult, SessionQuestion } from '../_types/session'
import { AnswerOptions } from './answer-options'
import { FeedbackPanel } from './feedback-panel'
import { QuestionCard } from './question-card'
import { SessionTimer } from './session-timer'

type ActiveSessionProps = {
  question: SessionQuestion
  questions: SessionQuestion[]
  currentIndex: number
  submitting: boolean
  error: string | null
  feedback: AnswerResult | null
  selectedOption: string | null
  state: string
  onSubmit: (selectedId: string) => void
  onNext: () => void
}

export function ActiveSession({
  question,
  questions,
  currentIndex,
  submitting,
  error,
  feedback,
  selectedOption,
  state,
  onSubmit,
  onNext,
}: ActiveSessionProps) {
  const feedbackData = feedback?.success ? feedback : null
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div
            data-testid="progress-bar"
            className="h-1.5 rounded-full bg-primary transition-all"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
        <SessionTimer />
      </div>
      <QuestionCard
        questionText={question.question_text}
        questionImageUrl={question.question_image_url}
        questionNumber={currentIndex + 1}
        totalQuestions={questions.length}
        dbQuestionNumber={question.question_number}
      />
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <AnswerOptions
        options={question.options}
        onSubmit={onSubmit}
        disabled={submitting || state === 'feedback'}
        correctOptionId={feedbackData?.correctOptionId}
        selectedOptionId={feedbackData ? selectedOption : null}
      />
      {state === 'feedback' && feedbackData && (
        <FeedbackPanel
          isCorrect={feedbackData.isCorrect}
          explanationText={feedbackData.explanationText}
          explanationImageUrl={feedbackData.explanationImageUrl}
          onNext={onNext}
        />
      )}
    </div>
  )
}
