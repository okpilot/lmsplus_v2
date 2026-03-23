import { AnswerOptions } from '@/app/app/_components/answer-options'
import { QuestionCard } from '@/app/app/_components/question-card'
import type { QuestionTab } from '../../_components/question-tabs'
import type { QuizState } from '../_hooks/use-quiz-state'
import { QuizTabContent } from './quiz-tab-content'

type QuizMainPanelProps = {
  s: QuizState
  activeTab: QuestionTab
  userId: string
  onSelectionChange?: (id: string | null) => void
}

export function QuizMainPanel({
  s,
  activeTab,
  userId,
  onSelectionChange,
}: Readonly<QuizMainPanelProps>) {
  if (!s.question) return null

  if (activeTab !== 'question') {
    return (
      <QuizTabContent
        activeTab={activeTab}
        questionId={s.questionId}
        existingAnswer={s.existingAnswer}
        currentFeedback={s.currentFeedback}
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
      <AnswerOptions
        key={s.question.id}
        options={s.question.options}
        onSubmit={s.handleSelectAnswer}
        disabled={s.submitting}
        selectedOptionId={s.existingAnswer?.selectedOptionId ?? null}
        correctOptionId={s.currentFeedback?.correctOptionId ?? null}
        onSelectionChange={onSelectionChange}
      />
    </div>
  )
}
