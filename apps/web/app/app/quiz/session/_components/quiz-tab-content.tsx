import { CommentsTab } from '../../_components/comments-tab'
import { ExplanationTab } from '../../_components/explanation-tab'
import type { QuestionTab } from '../../_components/question-tabs'
import { StatisticsTab } from '../../_components/statistics-tab'
import type { AnswerFeedback, DraftAnswer } from '../../types'

type QuizTabContentProps = {
  activeTab: QuestionTab
  questionId: string
  sessionId: string
  existingAnswer: DraftAnswer | undefined
  currentFeedback: AnswerFeedback | null
}

export function QuizTabContent({
  activeTab,
  questionId,
  sessionId,
  existingAnswer,
  currentFeedback,
}: QuizTabContentProps) {
  if (activeTab === 'explanation') {
    return currentFeedback ? (
      <ExplanationTab
        hasAnswered={true}
        isCorrect={currentFeedback.isCorrect}
        explanationText={currentFeedback.explanationText}
        explanationImageUrl={currentFeedback.explanationImageUrl}
      />
    ) : (
      <ExplanationTab hasAnswered={false} questionId={questionId} sessionId={sessionId} />
    )
  }
  if (activeTab === 'comments') return <CommentsTab />
  if (activeTab === 'statistics') {
    return <StatisticsTab questionId={questionId} hasAnswered={!!existingAnswer} />
  }
  return null
}
