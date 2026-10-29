'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { useGridWindow } from '../_hooks/use-grid-window'
import { FilterRow, GridToggle } from './filter-pill'
import { buildSquares, type GridFilter } from './question-grid-squares'

type QuestionGridProps = {
  totalQuestions: number
  currentIndex: number
  pinnedIds: Set<string>
  flaggedIds: Set<string>
  questionIds: string[]
  feedbackMap: Map<string, { isCorrect: boolean }>
  onNavigate: (index: number) => void
  isExamMode?: boolean
  answeredIds?: Set<string>
  seenIds?: Set<number>
}

const GAP = 6
const MOBILE_SQUARE = 36

type MobileGridProps = {
  squares: ReactNode[]
  filter: GridFilter
  totalQuestions: number
  currentIndex: number
}

// Below `lg` the grid collapses to two rows on the unfiltered view (flagged/pinned always
// show every match); from `lg` the panel shows every square and scrolls.
function MobileGrid({ squares, filter, totalQuestions, currentIndex }: Readonly<MobileGridProps>) {
  const enabled = filter === 'all'
  const mobile = useGridWindow({
    minSquare: MOBILE_SQUARE,
    gap: GAP,
    totalQuestions,
    currentIndex,
    enabled,
  })
  // Restore the default two-row window when a filter takes over, so returning
  // to the unfiltered view starts collapsed. (setExpanded identity is stable.)
  const { setExpanded } = mobile
  useEffect(() => {
    if (!enabled) setExpanded(false)
  }, [enabled, setExpanded])

  const visible = mobile.collapsed ? squares.slice(mobile.windowStart, mobile.windowEnd) : squares
  return (
    <div className="lg:hidden">
      <div
        data-testid="question-grid-mobile"
        ref={mobile.containerRef}
        className="grid grid-cols-(--layout-squares) gap-1.5"
      >
        {visible}
      </div>
      {mobile.needsCollapse && (
        <GridToggle
          testId="grid-toggle-mobile"
          expanded={mobile.expanded}
          totalQuestions={totalQuestions}
          onToggle={() => setExpanded((v) => !v)}
        />
      )}
    </div>
  )
}

export function QuestionGrid({
  totalQuestions,
  currentIndex,
  pinnedIds,
  flaggedIds,
  questionIds,
  feedbackMap,
  onNavigate,
  isExamMode,
  answeredIds,
  seenIds,
}: Readonly<QuestionGridProps>) {
  const [filter, setFilter] = useState<GridFilter>('all')
  const flaggedCount = flaggedIds.size
  const pinnedCount = pinnedIds.size

  useEffect(() => {
    if (filter === 'flagged' && flaggedCount === 0) setFilter('all')
    if (filter === 'pinned' && pinnedCount === 0) setFilter('all')
  }, [filter, flaggedCount, pinnedCount])

  const squares = buildSquares({
    totalQuestions,
    currentIndex,
    filter,
    questionIds,
    flaggedIds,
    pinnedIds,
    feedbackMap,
    onNavigate,
    isExamMode,
    answeredIds,
    seenIds,
  })

  return (
    <div className="space-y-2">
      <FilterRow
        filter={filter}
        setFilter={setFilter}
        flaggedCount={flaggedCount}
        pinnedCount={pinnedCount}
      />
      <div
        data-testid="question-grid"
        className="hidden grid-cols-(--layout-squares-panel) gap-1.5 lg:grid"
      >
        {squares}
      </div>
      <MobileGrid
        squares={squares}
        filter={filter}
        totalQuestions={totalQuestions}
        currentIndex={currentIndex}
      />
    </div>
  )
}
