'use client'

import { useEffect, useState } from 'react'
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
const DESKTOP_SQUARE = 32

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
}: QuestionGridProps) {
  const [filter, setFilter] = useState<GridFilter>('all')
  const flaggedCount = flaggedIds.size
  const pinnedCount = pinnedIds.size

  useEffect(() => {
    if (filter === 'flagged' && flaggedCount === 0) setFilter('all')
    if (filter === 'pinned' && pinnedCount === 0) setFilter('all')
  }, [filter, flaggedCount, pinnedCount])

  // Windowing collapses only on the unfiltered view; flagged/pinned always
  // show every match. Each breakpoint measures its own square size.
  const enabled = filter === 'all'
  const desktop = useGridWindow({
    minSquare: DESKTOP_SQUARE,
    gap: GAP,
    totalQuestions,
    currentIndex,
    enabled,
  })
  const mobile = useGridWindow({
    minSquare: MOBILE_SQUARE,
    gap: GAP,
    totalQuestions,
    currentIndex,
    enabled,
  })

  // Restore the default two-row window when a filter takes over, so returning
  // to the unfiltered view starts collapsed rather than remembering a prior
  // expansion. (setExpanded identities are stable useState setters.)
  const { setExpanded: setDesktopExpanded } = desktop
  const { setExpanded: setMobileExpanded } = mobile
  useEffect(() => {
    if (!enabled) {
      setDesktopExpanded(false)
      setMobileExpanded(false)
    }
  }, [enabled, setDesktopExpanded, setMobileExpanded])

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
  const desktopSquares = desktop.collapsed
    ? squares.slice(desktop.windowStart, desktop.windowEnd)
    : squares
  const mobileSquares = mobile.collapsed
    ? squares.slice(mobile.windowStart, mobile.windowEnd)
    : squares

  return (
    <div className="space-y-2">
      <FilterRow
        filter={filter}
        setFilter={setFilter}
        flaggedCount={flaggedCount}
        pinnedCount={pinnedCount}
      />
      <div className="hidden md:block">
        <div
          data-testid="question-grid"
          ref={desktop.containerRef}
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${DESKTOP_SQUARE}px, 1fr))` }}
        >
          {desktopSquares}
        </div>
        {desktop.needsCollapse && (
          <GridToggle
            testId="grid-toggle-desktop"
            expanded={desktop.expanded}
            totalQuestions={totalQuestions}
            onToggle={() => desktop.setExpanded((v) => !v)}
          />
        )}
      </div>
      <div className="md:hidden">
        <div
          data-testid="question-grid-mobile"
          ref={mobile.containerRef}
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${MOBILE_SQUARE}px, 1fr))` }}
        >
          {mobileSquares}
        </div>
        {mobile.needsCollapse && (
          <GridToggle
            testId="grid-toggle-mobile"
            expanded={mobile.expanded}
            totalQuestions={totalQuestions}
            onToggle={() => mobile.setExpanded((v) => !v)}
          />
        )}
      </div>
    </div>
  )
}
