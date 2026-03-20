import { FinishQuizDialog } from '../../_components/finish-quiz-dialog'
import { QuizNavBar } from './quiz-nav-bar'

type QuizControlsProps = {
  isPinned: boolean
  isFlagged: boolean
  currentIndex: number
  totalQuestions: number
  answeredCount: number
  submitting: boolean
  showFinishDialog: boolean
  onTogglePin: () => void
  onToggleFlag: () => void
  onPrev: () => void
  onNext: () => void
  onSubmit: () => void
  onCancel: () => void
  onSave: () => void
  onDiscard: () => void
}

export function QuizControls({
  isPinned,
  isFlagged,
  currentIndex,
  totalQuestions,
  answeredCount,
  submitting,
  showFinishDialog,
  onTogglePin,
  onToggleFlag,
  onPrev,
  onNext,
  onSubmit,
  onCancel,
  onSave,
  onDiscard,
}: QuizControlsProps) {
  return (
    <>
      {/* Action bar: Previous / Flag / Pin / Next */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <QuizNavBar
          currentIndex={currentIndex}
          totalQuestions={totalQuestions}
          onPrev={onPrev}
          onNext={onNext}
        />

        <div className="flex items-center gap-2">
          <ActionButton
            active={isFlagged}
            onClick={onToggleFlag}
            label={isFlagged ? 'Unflag' : 'Flag'}
            testId="flag-button"
            activeClass="border-orange-400 bg-orange-100 text-orange-700 dark:border-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
          />
          <ActionButton
            active={isPinned}
            onClick={onTogglePin}
            label={isPinned ? 'Unpin' : 'Pin'}
            testId="pin-button"
            activeClass="border-amber-400 bg-amber-100 text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
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

function ActionButton({
  active,
  onClick,
  label,
  testId,
  activeClass,
}: {
  active: boolean
  onClick: () => void
  label: string
  testId: string
  activeClass: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${activeClass}`
          : 'rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted'
      }
    >
      {label}
    </button>
  )
}
