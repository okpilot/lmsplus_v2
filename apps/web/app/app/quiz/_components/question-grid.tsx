import { cn } from '@/lib/utils'

type QuestionGridProps = {
  totalQuestions: number
  currentIndex: number
  answeredIds: Set<string>
  pinnedIds: Set<string>
  questionIds: string[]
  onNavigate: (index: number) => void
}

function getButtonClass(opts: {
  isCurrent: boolean
  isAnswered: boolean
  isPinned: boolean
}) {
  if (opts.isPinned) {
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  }
  if (opts.isAnswered) return 'bg-primary/20 text-primary'
  return 'bg-muted text-muted-foreground'
}

export function QuestionGrid({
  totalQuestions,
  currentIndex,
  answeredIds,
  pinnedIds,
  questionIds,
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
        const isAnswered = answeredIds.has(qId)
        const isPinned = pinnedIds.has(qId)
        return (
          <button
            key={qId || i}
            type="button"
            data-testid={`grid-btn-${i}`}
            onClick={() => onNavigate(i)}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-medium transition-colors',
              getButtonClass({ isCurrent, isAnswered, isPinned }),
              isCurrent && 'ring-2 ring-primary',
            )}
            aria-current={isCurrent ? 'step' : undefined}
            aria-label={`Question ${i + 1}`}
          >
            {i + 1}
          </button>
        )
      })}
    </div>
  )
}
