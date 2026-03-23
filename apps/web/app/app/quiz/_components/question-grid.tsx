'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type GridFilter = 'all' | 'flagged' | 'pinned'

type QuestionGridProps = {
  totalQuestions: number
  currentIndex: number
  pinnedIds: Set<string>
  flaggedIds: Set<string>
  questionIds: string[]
  feedbackMap: Map<string, { isCorrect: boolean }>
  onNavigate: (index: number) => void
}

const MIN_SQUARE = 36 // minmax(36px, 1fr) on mobile
const GAP = 6 // gap-1.5 = 6px

function getSquareClass(opts: { isCurrent: boolean; isCorrect: boolean | null }) {
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
  const [filter, setFilter] = useState<GridFilter>('all')
  const [expanded, setExpanded] = useState(false)
  const [perRow, setPerRow] = useState(9)
  const containerRef = useRef<HTMLDivElement>(null)

  // Measure container width to calculate squares per row
  const measure = useCallback(() => {
    if (!containerRef.current) return
    const width = containerRef.current.offsetWidth
    const count = Math.floor((width + GAP) / (MIN_SQUARE + GAP))
    setPerRow(Math.max(count, 1))
  }, [])

  useEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [measure])

  const flaggedCount = flaggedIds.size
  const pinnedCount = pinnedIds.size

  const twoRows = perRow * 2
  const needsCollapse = totalQuestions > twoRows

  // Sliding window: keep current question visible within 2 rows
  const windowStart = (() => {
    if (!needsCollapse || expanded) return 0
    if (currentIndex < twoRows) return 0
    // Shift window so current question is in the second row
    const row = Math.floor(currentIndex / perRow)
    return (row - 1) * perRow
  })()
  const windowEnd = expanded ? totalQuestions : Math.min(windowStart + twoRows, totalQuestions)

  const squares = Array.from({ length: totalQuestions }, (_, i) => {
    const qId = questionIds[i] ?? ''
    const isCurrent = i === currentIndex
    const feedback = feedbackMap.get(qId)
    const isCorrect = feedback ? feedback.isCorrect : null
    const isFlagged = flaggedIds.has(qId)
    const isPinned = pinnedIds.has(qId)

    const hidden = (filter === 'flagged' && !isFlagged) || (filter === 'pinned' && !isPinned)

    if (hidden) return null

    return (
      <button
        key={qId || i}
        type="button"
        data-testid={`grid-btn-${i}`}
        onClick={() => onNavigate(i)}
        className={cn(
          'flex aspect-square items-center justify-center rounded-lg text-xs font-medium transition-all',
          getSquareClass({ isCurrent, isCorrect }),
        )}
        aria-current={isCurrent ? 'step' : undefined}
        aria-label={`Question ${i + 1}${isFlagged ? ', flagged' : ''}${isPinned ? ', pinned' : ''}`}
      >
        {i + 1}
      </button>
    )
  })

  return (
    <div className="space-y-2">
      {/* Filter row */}
      {(flaggedCount > 0 || pinnedCount > 0) && (
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
      )}

      {/* Desktop: always show all, CSS grid fills evenly */}
      <div
        data-testid="question-grid"
        className="hidden gap-1.5 md:grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(32px, 1fr))' }}
      >
        {squares}
      </div>

      {/* Mobile: measured container, 2-row window or expanded */}
      <div className="md:hidden" ref={containerRef}>
        <div
          data-testid="question-grid-mobile"
          className="grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))' }}
        >
          {expanded ? squares : squares.slice(windowStart, windowEnd)}
        </div>

        {needsCollapse && (
          <button
            type="button"
            data-testid="grid-toggle"
            onClick={() => setExpanded((v) => !v)}
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
        )}
      </div>
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  label,
  testId,
}: {
  active: boolean
  onClick: () => void
  label: string
  testId?: string
}) {
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
