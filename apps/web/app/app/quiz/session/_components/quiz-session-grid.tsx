import { QuestionGrid } from '../../_components/question-grid'
import type { QuizState } from '../_hooks/use-quiz-state'

type Props = {
  s: QuizState
  isDiscovery: boolean
  totalQuestions: number
  flaggedIds: Set<string>
  feedbackMap: Map<string, { isCorrect: boolean }>
}

/** The question navigator, fed the colouring inputs each mode needs. */
export function QuizSessionGrid({
  s,
  isDiscovery,
  totalQuestions,
  flaggedIds,
  feedbackMap,
}: Readonly<Props>) {
  return (
    <QuestionGrid
      totalQuestions={totalQuestions}
      currentIndex={s.currentIndex}
      pinnedIds={s.pinnedQuestions}
      flaggedIds={flaggedIds}
      questionIds={s.questionIds}
      // Discovery's navigator is driven by `seenIds` (visited = green), not its pre-marked feedback.
      feedbackMap={s.isExam || isDiscovery ? new Map() : feedbackMap}
      answeredIds={isDiscovery ? undefined : s.answeredIds}
      seenIds={isDiscovery ? s.seenIndices : undefined}
      isExamMode={s.isExam}
      onNavigate={s.navigateTo}
    />
  )
}
