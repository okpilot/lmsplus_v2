import { QuestionCard } from '@/app/app/_components/question-card'
import type { QuestionTab } from '../../_components/question-tabs'
import type { QuizState } from '../_hooks/use-quiz-state'
import { AnswerInput } from './answer-input'
import { QuizTabContent } from './quiz-tab-content'

type QuizMainPanelProps = {
  s: QuizState
  activeTab: QuestionTab
  userId: string
  onSelectionChange?: (id: string | null) => void
  keyboardHighlightedId?: string | null
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

  // A dialog_fill question is the transcript and nothing else: the VictorOne Part 2 task sheet
  // shows no heading above the dialogue, so a scene line here would be a crutch the real exam
  // never gives. `question_text` still holds that scene for the admin question list (the column
  // is NOT NULL) — it just stops reaching the student. See scripts/dialog-fill-content.ts R7.
  const showsQuestionCard = s.question.question_type !== 'dialog_fill'

  return (
    <div className="space-y-4">
      {showsQuestionCard && (
        <QuestionCard
          questionText={s.question.question_text}
          questionImageUrl={s.question.question_image_url}
        />
      )}
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
