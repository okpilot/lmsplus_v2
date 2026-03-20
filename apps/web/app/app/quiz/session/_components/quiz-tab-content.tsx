import { CommentsTab } from '../../_components/comments-tab'
import { ExplanationTab } from '../../_components/explanation-tab'
import type { QuestionTab } from '../../_components/question-tabs'
import { StatisticsTab } from '../../_components/statistics-tab'
import type { AnswerFeedback, DraftAnswer } from '../../types'

type QuizTabContentProps = {
  activeTab: QuestionTab
  questionId: string
  existingAnswer: DraftAnswer | undefined
  currentFeedback: AnswerFeedback | null
  explanationText: string | null
  explanationImageUrl: string | null
  userId: string
  learningObjective?: string | null
}

export function QuizTabContent({
  activeTab,
  questionId,
  existingAnswer,
  currentFeedback,
  explanationText,
  explanationImageUrl,
  userId,
}: QuizTabContentProps) {
  if (activeTab === 'explanation') {
    return (
      <ExplanationTab
        explanationText={explanationText}
        explanationImageUrl={explanationImageUrl}
        isCorrect={currentFeedback?.isCorrect ?? null}
      />
    )
  }
  if (activeTab === 'comments')
    return <CommentsTab questionId={questionId} currentUserId={userId} />
  if (activeTab === 'statistics') {
    return <StatisticsTab questionId={questionId} hasAnswered={!!existingAnswer} />
  }
  return null
}
