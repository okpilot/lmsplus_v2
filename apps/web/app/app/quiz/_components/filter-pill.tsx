import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function getSquareClass(opts: {
  isCurrent: boolean
  isCorrect: boolean | null
  isAnsweredInExam?: boolean
}) {
  if (opts.isCurrent) return 'bg-primary text-primary-foreground'
  if (opts.isAnsweredInExam) return 'bg-muted-foreground/60 text-background'
  if (opts.isCorrect === true) return 'bg-green-500 text-white'
  if (opts.isCorrect === false) return 'bg-red-500 text-white'
  return 'border border-border text-muted-foreground'
}

export function FilterPill({
  active,
  onClick,
  label,
  testId,
}: Readonly<{
  active: boolean
  onClick: () => void
  label: string
  testId?: string
}>) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}

export function FilterRow({
  filter,
  setFilter,
  flaggedCount,
  pinnedCount,
}: Readonly<{
  filter: 'all' | 'flagged' | 'pinned'
  setFilter: (f: 'all' | 'flagged' | 'pinned') => void
  flaggedCount: number
  pinnedCount: number
}>) {
  return (
    <div className="flex items-center gap-1 text-xs" data-testid="grid-filters">
      <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
      {flaggedCount > 0 && (
        <FilterPill
          active={filter === 'flagged'}
          onClick={() => setFilter('flagged')}
          label={`Flagged (${flaggedCount})`}
          testId="filter-flagged"
        />
      )}
      {pinnedCount > 0 && (
        <FilterPill
          active={filter === 'pinned'}
          onClick={() => setFilter('pinned')}
          label={`Pinned (${pinnedCount})`}
          testId="filter-pinned"
        />
      )}
    </div>
  )
}

export function GridToggle({
  expanded,
  totalQuestions,
  onToggle,
}: Readonly<{ expanded: boolean; totalQuestions: number; onToggle: () => void }>) {
  return (
    <button
      type="button"
      data-testid="grid-toggle"
      onClick={onToggle}
      className="mt-1.5 flex w-full items-center justify-center gap-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {expanded ? (
        <>
          Hide <ChevronUp className="h-3 w-3" />
        </>
      ) : (
        <>
          Show all ({totalQuestions}) <ChevronDown className="h-3 w-3" />
        </>
      )}
    </button>
  )
}
