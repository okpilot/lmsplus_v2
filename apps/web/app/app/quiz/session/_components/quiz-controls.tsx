import { Flag, Pin } from 'lucide-react'

type QuizControlsProps = {
  isPinned: boolean
  isFlagged: boolean
  currentIndex: number
  totalQuestions: number
  submitting: boolean
  showSubmit: boolean
  flagLoading?: boolean
  onTogglePin: () => void
  onToggleFlag: () => void
  onPrev: () => void
  onNext: () => void
  onSubmitAnswer: () => void
}

export function QuizControls({
  isPinned,
  isFlagged,
  currentIndex,
  totalQuestions,
  submitting,
  showSubmit,
  flagLoading,
  onTogglePin,
  onToggleFlag,
  onPrev,
  onNext,
  onSubmitAnswer,
}: QuizControlsProps) {
  return (
    <div className="py-3">
      {/* Full-width Submit button on top (mobile only) */}
      {showSubmit && (
        <button
          type="button"
          onClick={onSubmitAnswer}
          disabled={submitting}
          className="mb-3 w-full rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 md:hidden"
        >
          Submit Answer
        </button>
      )}

      {/* Nav row */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          &lsaquo; Previous
        </button>

        <div className="flex items-center gap-2">
          <ActionButton
            active={isFlagged}
            onClick={onToggleFlag}
            icon={<Flag className="h-4 w-4" />}
            label={isFlagged ? 'Unflag' : 'Flag'}
            testId="flag-button"
            activeClass="border-transparent bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
            disabled={flagLoading}
          />
          <ActionButton
            active={isPinned}
            onClick={onTogglePin}
            icon={<Pin className="h-4 w-4" />}
            label={isPinned ? 'Unpin' : 'Pin'}
            testId="pin-button"
            activeClass="border-transparent bg-primary/10 text-primary dark:bg-primary/15"
          />
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={currentIndex === totalQuestions - 1}
          className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Next &rsaquo;
        </button>
      </div>
    </div>
  )
}

function ActionButton({
  active,
  onClick,
  icon,
  label,
  testId,
  activeClass,
  disabled,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  testId: string
  activeClass: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={
        active
          ? `flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${activeClass}`
          : 'flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:pointer-events-none'
      }
    >
      {icon}
      {label}
    </button>
  )
}
