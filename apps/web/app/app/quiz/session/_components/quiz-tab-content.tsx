import { CommentsTab } from '../../_components/comments-tab'
import { ExplanationTab } from '../../_components/explanation-tab'
import type { QuestionTab } from '../../_components/question-tabs'
import { StatisticsTab } from '../../_components/statistics-tab'
import type { DraftAnswer } from '../../types'

type QuizTabContentProps = {
  activeTab: QuestionTab
  questionId: string
  existingAnswer: DraftAnswer | undefined
  explanationText: string | null
  explanationImageUrl: string | null
  userId: string
  learningObjective?: string | null
}

export function QuizTabContent({
  activeTab,
  questionId,
  existingAnswer,
  explanationText,
  explanationImageUrl,
  userId,
  learningObjective,
}: QuizTabContentProps) {
  if (activeTab === 'explanation') {
    return (
      <ExplanationTab
        explanationText={explanationText}
        explanationImageUrl={explanationImageUrl}
        learningObjective={learningObjective}
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
