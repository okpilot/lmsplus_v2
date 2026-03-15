import type { AnswerResult, SessionQuestion, SessionState } from '../_types/session'
import { QuestionCard } from './question-card'
import { SessionAnswerBlock } from './session-answer-block'
import { SessionProgressBar } from './session-progress-bar'

type ActiveSessionProps = {
  question: SessionQuestion
  questions: SessionQuestion[]
  currentIndex: number
  submitting: boolean
  error: string | null
  feedback: AnswerResult | null
  selectedOption: string | null
  state: SessionState
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
      <SessionProgressBar currentIndex={currentIndex} totalQuestions={questions.length} />
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
      <SessionAnswerBlock
        options={question.options}
        onSubmit={onSubmit}
        submitting={submitting}
        state={state}
        feedbackData={feedbackData}
        selectedOption={selectedOption}
        onNext={onNext}
      />
    </div>
  )
}
