import { Flag, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'

type QuizCardHeaderProps = {
  currentIndex: number
  totalQuestions: number
  questionNumber: string | null
  canFlag: boolean
  isFlagged: boolean
  flagLoading: boolean
  isPinned: boolean
  onToggleFlag: () => void
  onTogglePin: () => void
}

/** The question card's top row: counter and code left, Flag and Pin toggles right. */
export function QuizCardHeader({
  currentIndex,
  totalQuestions,
  questionNumber,
  canFlag,
  isFlagged,
  flagLoading,
  isPinned,
  onToggleFlag,
  onTogglePin,
}: Readonly<QuizCardHeaderProps>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <p className="text-label-strong">
          Question {currentIndex + 1} of {totalQuestions}
        </p>
        {questionNumber && (
          <span className="text-caption text-muted-foreground">No. {questionNumber}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canFlag && (
          <Button
            type="button"
            variant="toggle"
            size="icon"
            data-testid="flag-button"
            aria-label="Flag question"
            aria-pressed={isFlagged}
            disabled={flagLoading}
            onClick={onToggleFlag}
          >
            <Flag className={isFlagged ? 'fill-caution text-caution' : undefined} />
          </Button>
        )}
        <Button
          type="button"
          variant="toggle"
          size="icon"
          data-testid="pin-button"
          aria-label="Pin question"
          aria-pressed={isPinned}
          onClick={onTogglePin}
        >
          <Pin className={isPinned ? 'fill-current' : undefined} />
        </Button>
      </div>
    </div>
  )
}
