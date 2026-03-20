import { cn } from '@/lib/utils'

type QuestionGridProps = {
  totalQuestions: number
  currentIndex: number
  pinnedIds: Set<string>
  flaggedIds: Set<string>
  questionIds: string[]
  feedbackMap: Map<string, { isCorrect: boolean }>
  onNavigate: (index: number) => void
}

function FlagIcon() {
  return (
    <svg
      className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 text-orange-500"
      viewBox="0 0 10 10"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2 1v8M2 1h5l-1.5 2L7 5H2" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg
      className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 text-amber-500"
      viewBox="0 0 10 10"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5 0L3 4H7L5 0ZM5 4v6" />
    </svg>
  )
}

function getCircleClass(opts: { isCurrent: boolean; isCorrect: boolean | null }) {
  if (opts.isCurrent) return 'bg-primary text-primary-foreground'
  if (opts.isCorrect === true) return 'bg-green-500 text-white'
  if (opts.isCorrect === false) return 'bg-red-500 text-white'
  return 'border border-border text-muted-foreground'
}

export function QuestionGrid({
  totalQuestions,
  currentIndex,
  pinnedIds,
  flaggedIds,
  questionIds,
  feedbackMap,
  onNavigate,
}: QuestionGridProps) {
  return (
    <div
      data-testid="question-grid"
      className={cn('flex gap-1.5 overflow-x-auto p-2', 'md:flex-wrap md:overflow-x-visible')}
    >
      {Array.from({ length: totalQuestions }, (_, i) => {
        const qId = questionIds[i] ?? ''
        const isCurrent = i === currentIndex
        const feedback = feedbackMap.get(qId)
        const isCorrect = feedback ? feedback.isCorrect : null
        const isFlagged = flaggedIds.has(qId)
        const isPinned = pinnedIds.has(qId)
        return (
          <button
            key={qId || i}
            type="button"
            data-testid={`grid-btn-${i}`}
            onClick={() => onNavigate(i)}
            className={cn(
              'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
              getCircleClass({ isCurrent, isCorrect }),
              isPinned && 'border-b-2 border-amber-400',
            )}
            aria-current={isCurrent ? 'step' : undefined}
            aria-label={`Question ${i + 1}${isFlagged ? ', flagged' : ''}${isPinned ? ', pinned' : ''}`}
          >
            {isFlagged && <FlagIcon />}
            {isPinned && <PinIcon />}
            {i + 1}
          </button>
        )
      })}
    </div>
  )
}
