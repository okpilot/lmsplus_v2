import { FinishQuizDialog } from '../../_components/finish-quiz-dialog'
import { QuizNavBar } from './quiz-nav-bar'

type QuizControlsProps = {
  isPinned: boolean
  currentIndex: number
  totalQuestions: number
  answeredCount: number
  submitting: boolean
  showFinishDialog: boolean
  onTogglePin: () => void
  onPrev: () => void
  onNext: () => void
  onFinish: () => void
  onSubmit: () => void
  onCancel: () => void
  onSave: () => void
  onDiscard: () => void
}

export function QuizControls({
  isPinned,
  currentIndex,
  totalQuestions,
  answeredCount,
  submitting,
  showFinishDialog,
  onTogglePin,
  onPrev,
  onNext,
  onFinish,
  onSubmit,
  onCancel,
  onSave,
  onDiscard,
}: QuizControlsProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="pin-button"
          onClick={onTogglePin}
          className={
            isPinned
              ? 'rounded-lg border border-yellow-400 bg-yellow-100 px-3 py-2 text-sm font-medium text-yellow-700 transition-colors dark:border-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
              : 'rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted'
          }
          aria-pressed={isPinned}
        >
          {isPinned ? 'Unpin' : 'Pin'}
        </button>
        <div className="flex-1">
          <QuizNavBar
            currentIndex={currentIndex}
            totalQuestions={totalQuestions}
            onPrev={onPrev}
            onNext={onNext}
            onFinish={onFinish}
          />
        </div>
      </div>
      <FinishQuizDialog
        open={showFinishDialog}
        answeredCount={answeredCount}
        totalQuestions={totalQuestions}
        submitting={submitting}
        onSubmit={onSubmit}
        onCancel={onCancel}
        onSave={onSave}
        onDiscard={onDiscard}
      />
    </>
  )
}
