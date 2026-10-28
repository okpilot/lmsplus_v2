import { Flag, Pin } from 'lucide-react'
import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'

type QuizControlsProps = {
  isPinned: boolean
  isFlagged: boolean
  currentIndex: number
  totalQuestions: number
  submitting: boolean
  showSubmit: boolean
  flagLoading?: boolean
  canFlag?: boolean
  onTogglePin: () => void
  onToggleFlag: () => void
  onPrev: () => void
  onNext: () => void
  onSubmitAnswer: () => void
  isExam?: boolean
}

export function QuizControls({
  isPinned,
  isFlagged,
  currentIndex,
  totalQuestions,
  submitting,
  showSubmit,
  flagLoading,
  canFlag = true,
  onTogglePin,
  onToggleFlag,
  onPrev,
  onNext,
  onSubmitAnswer,
  isExam,
}: Readonly<QuizControlsProps>) {
  return (
    <div className="py-3">
      {/* Full-width Submit button on top (mobile only) */}
      {showSubmit && (
        <Button
          type="button"
          data-testid="submit-answer-mobile"
          onClick={onSubmitAnswer}
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="mb-3 w-full md:hidden"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <BusyLabel busy={submitting}>{isExam ? 'Confirm Answer' : 'Submit Answer'}</BusyLabel>
          </span>
        </Button>
      )}

      {/* Nav row */}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onPrev} disabled={currentIndex === 0}>
          &lsaquo; Previous
        </Button>

        <div className="flex items-center gap-2">
          {canFlag && (
            <ActionButton
              active={isFlagged}
              onClick={onToggleFlag}
              icon={<Flag className={isFlagged ? 'fill-caution text-caution' : undefined} />}
              label={isFlagged ? 'Unflag' : 'Flag'}
              testId="flag-button"
              disabled={flagLoading}
            />
          )}
          <ActionButton
            active={isPinned}
            onClick={onTogglePin}
            icon={<Pin />}
            label={isPinned ? 'Unpin' : 'Pin'}
            testId="pin-button"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onNext}
          disabled={currentIndex === totalQuestions - 1}
        >
          Next &rsaquo;
        </Button>
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
  disabled,
}: Readonly<{
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  testId: string
  disabled?: boolean
}>) {
  return (
    <Button
      type="button"
      variant="toggle"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
    >
      {icon}
      {label}
    </Button>
  )
}
