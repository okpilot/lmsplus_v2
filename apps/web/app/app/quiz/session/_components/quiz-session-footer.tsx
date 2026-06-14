import type { QuizState } from '../_hooks/use-quiz-state'
import { QuizControls } from './quiz-controls'

type QuizSessionFooterProps = {
  s: QuizState
  totalQuestions: number
  isFlagged: boolean
  flagLoading: boolean
  showSubmit: boolean
  pendingOptionId: string | null
  onToggleFlag: () => void
}

/** The fixed bottom control bar (prev/next, pin, flag, submit). */
export function QuizSessionFooter({
  s,
  totalQuestions,
  isFlagged,
  flagLoading,
  showSubmit,
  pendingOptionId,
  onToggleFlag,
}: Readonly<QuizSessionFooterProps>) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-4 pb-[env(safe-area-inset-bottom)] md:px-8">
      <div className="mx-auto max-w-3xl">
        <QuizControls
          isPinned={s.isPinned}
          isFlagged={isFlagged}
          currentIndex={s.currentIndex}
          totalQuestions={totalQuestions}
          submitting={s.submitting}
          showSubmit={showSubmit}
          flagLoading={flagLoading}
          onTogglePin={s.togglePin}
          onToggleFlag={onToggleFlag}
          onPrev={() => s.navigate(-1)}
          onNext={() => s.navigate(1)}
          onSubmitAnswer={async () => {
            if (pendingOptionId) await s.handleSelectAnswer(pendingOptionId)
          }}
          isExam={s.isExam}
        />
      </div>
    </div>
  )
}
