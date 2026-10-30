import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'

/** The card's action slot: Submit (with a ghost Next) before an MC answer, a primary Next after, else a ghost Next. */
export type QuizSlotAction = 'submit' | 'next' | 'none'

type QuizNavBarProps = {
  currentIndex: number
  totalQuestions: number
  action: QuizSlotAction
  canSubmit: boolean
  submitting: boolean
  isExam: boolean
  onPrev: () => void
  onNext: () => void
  onSubmit: () => void
}

function ActionSlot({
  action,
  canSubmit,
  submitting,
  isExam,
  isLast,
  onNext,
  onSubmit,
}: Readonly<
  Omit<QuizNavBarProps, 'currentIndex' | 'totalQuestions' | 'onPrev'> & { isLast: boolean }
>) {
  if (action === 'next') {
    return (
      <Button type="button" onClick={onNext} disabled={isLast}>
        Next &rsaquo;
      </Button>
    )
  }
  const skip = (
    <Button type="button" variant="ghost" onClick={onNext} disabled={isLast || submitting}>
      Next &rsaquo;
    </Button>
  )
  if (action === 'none') return skip
  return (
    <div className="flex gap-2">
      {skip}
      <Button
        type="button"
        data-testid="submit-answer"
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
        aria-busy={submitting || undefined}
      >
        <BusyLabel busy={submitting}>{isExam ? 'Confirm Answer' : 'Submit Answer'}</BusyLabel>
      </Button>
    </div>
  )
}

/** The question card's bottom row: ghost Previous left, one action slot right. */
export function QuizNavBar({
  currentIndex,
  totalQuestions,
  onPrev,
  ...slot
}: Readonly<QuizNavBarProps>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="ghost" onClick={onPrev} disabled={currentIndex === 0}>
        &lsaquo; Previous
      </Button>
      <div className="ml-auto">
        <ActionSlot {...slot} isLast={currentIndex === totalQuestions - 1} />
      </div>
    </div>
  )
}
