import { Card, CardContent } from '@/components/ui/card'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import type { QuestionTab } from '../../_components/question-tabs'
import type { QuizState } from '../_hooks/use-quiz-state'
import { canFlagQuestion } from '../_utils/can-flag-question'
import { QuizCardHeader } from './quiz-card-header'
import { QuizMainPanel } from './quiz-main-panel'
import { QuizNavBar, type QuizSlotAction } from './quiz-nav-bar'

type QuizQuestionCardProps = {
  s: QuizState
  activeTab: QuestionTab
  userId: string
  totalQuestions: number
  examMode?: DbQuizMode
  isFlagged: boolean
  flagLoading: boolean
  onToggleFlag: () => void
  pendingOptionId: string | null
  onSelectionChange: (id: string | null) => void
  keyboardHighlightedId: string | null
}

// The answer is recorded optimistically before the per-answer RPC resolves (#886), so Submit stays
// mounted while `answering` — else it unmounts before its spinner paints.
function slotAction(s: QuizState, activeTab: QuestionTab): QuizSlotAction {
  const isMc = s.question?.question_type === 'multiple_choice'
  if (isMc && activeTab === 'question' && s.answering) return 'submit'
  if (s.existingAnswer) return 'next'
  if (isMc && activeTab === 'question') return 'submit'
  return 'none'
}

/** Counter and toggles, the question with its answers, then Previous and the action slot. */
export function QuizQuestionCard({
  s,
  activeTab,
  userId,
  totalQuestions,
  examMode,
  isFlagged,
  flagLoading,
  onToggleFlag,
  pendingOptionId,
  onSelectionChange,
  keyboardHighlightedId,
}: Readonly<QuizQuestionCardProps>) {
  return (
    <Card>
      <CardContent>
        <QuizCardHeader
          currentIndex={s.currentIndex}
          totalQuestions={totalQuestions}
          questionNumber={s.question?.question_number ?? null}
          canFlag={canFlagQuestion({ isExam: s.isExam, examMode })}
          isFlagged={isFlagged}
          flagLoading={flagLoading}
          isPinned={s.isPinned}
          onToggleFlag={onToggleFlag}
          onTogglePin={s.togglePin}
        />
      </CardContent>
      <CardContent>
        <QuizMainPanel
          s={s}
          activeTab={activeTab}
          userId={userId}
          onSelectionChange={onSelectionChange}
          keyboardHighlightedId={keyboardHighlightedId}
        />
      </CardContent>
      <CardContent>
        <QuizNavBar
          currentIndex={s.currentIndex}
          totalQuestions={totalQuestions}
          action={slotAction(s, activeTab)}
          canSubmit={!!pendingOptionId}
          // #533: the spinner fires on the per-answer checkAnswer RPC (answering), not the session-level submitting.
          submitting={s.answering}
          isExam={s.isExam}
          onPrev={() => s.navigate(-1)}
          onNext={() => s.navigate(1)}
          onSubmit={async () => {
            if (pendingOptionId) await s.handleSelectAnswer(pendingOptionId)
          }}
        />
      </CardContent>
    </Card>
  )
}
