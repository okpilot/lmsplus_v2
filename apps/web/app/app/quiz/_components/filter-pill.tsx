import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

type SquareOpts = {
  isCurrent: boolean
  isCorrect: boolean | null
  isAnsweredInExam?: boolean
  // Discovery mode: a visited (but unscored) question reads as answered.
  isSeen?: boolean
}

export type SquareStatus = 'unseen' | 'answered' | 'correct' | 'wrong'

export function getSquareStatus(opts: SquareOpts): SquareStatus {
  if (opts.isAnsweredInExam || opts.isSeen) return 'answered'
  if (opts.isCorrect === true) return 'correct'
  if (opts.isCorrect === false) return 'wrong'
  return 'unseen'
}

const STATUS_CLASS: Record<SquareStatus, string> = {
  unseen: 'border border-border text-muted-foreground',
  answered: 'bg-muted text-foreground',
  correct: 'bg-success-soft text-success',
  wrong: 'bg-danger-soft text-danger',
}

export function getSquareClassFor(status: SquareStatus, isCurrent: boolean) {
  const base = STATUS_CLASS[status]
  return isCurrent ? `${base} ring-2 ring-primary` : base
}

export function getSquareClass(opts: SquareOpts) {
  return getSquareClassFor(getSquareStatus(opts), opts.isCurrent)
}

function FilterPill({
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
    <Button
      type="button"
      size="sm"
      variant="toggle"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </Button>
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
  testId = 'grid-toggle',
}: Readonly<{
  expanded: boolean
  totalQuestions: number
  onToggle: () => void
  testId?: string
}>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid={testId}
      onClick={onToggle}
      className="mt-1.5 w-full text-muted-foreground"
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
    </Button>
  )
}
