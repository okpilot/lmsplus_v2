import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'

/** What the card's single action slot shows: Submit before an answer, Next after, else nothing. */
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
  if (action === 'submit') {
    return (
      <Button
        type="button"
        data-testid="submit-answer"
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
        aria-busy={submitting || undefined}
      >
        <BusyLabel busy={submitting}>{isExam ? 'Confirm Answer' : 'Submit Answer'}</BusyLabel>
      </Button>
    )
  }
  if (action === 'next') {
    return (
      <Button type="button" onClick={onNext} disabled={isLast}>
        Next &rsaquo;
      </Button>
    )
  }
  return null
}

/** The question card's bottom row: ghost Previous left, one action slot right. */
export function QuizNavBar({
  currentIndex,
  totalQuestions,
  onPrev,
  ...slot
}: Readonly<QuizNavBarProps>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="ghost" onClick={onPrev} disabled={currentIndex === 0}>
        &lsaquo; Previous
      </Button>
      <ActionSlot {...slot} isLast={currentIndex === totalQuestions - 1} />
    </div>
  )
}
