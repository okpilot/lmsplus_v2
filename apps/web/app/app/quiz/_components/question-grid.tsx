'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { FilterRow, GridToggle, getSquareClass } from './filter-pill'

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

const MIN_SQUARE = 36
const GAP = 6

function calcWindowStart(opts: {
  needsCollapse: boolean
  expanded: boolean
  currentIndex: number
  twoRows: number
  perRow: number
}) {
  if (!opts.needsCollapse || opts.expanded || opts.currentIndex < opts.twoRows) return 0
  return (Math.floor(opts.currentIndex / opts.perRow) - 1) * opts.perRow
}

function buildSquares(opts: QuestionGridProps & { filter: GridFilter }) {
  const {
    totalQuestions,
    currentIndex,
    filter,
    questionIds,
    flaggedIds,
    pinnedIds,
    feedbackMap,
    onNavigate,
  } = opts
  return Array.from({ length: totalQuestions }, (_, i) => {
    const qId = questionIds[i] ?? ''
    const isCurrent = i === currentIndex
    const feedback = feedbackMap.get(qId)
    const isCorrect = feedback ? feedback.isCorrect : null
    const isFlagged = flaggedIds.has(qId)
    const isPinned = pinnedIds.has(qId)
    if ((filter === 'flagged' && !isFlagged) || (filter === 'pinned' && !isPinned)) return null
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

  const measure = useCallback(() => {
    if (!containerRef.current) return
    const width = containerRef.current.offsetWidth
    setPerRow(Math.max(Math.floor((width + GAP) / (MIN_SQUARE + GAP)), 1))
  }, [])

  useEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [measure])

  const flaggedCount = flaggedIds.size
  const pinnedCount = pinnedIds.size

  useEffect(() => {
    if (filter === 'flagged' && flaggedCount === 0) setFilter('all')
    if (filter === 'pinned' && pinnedCount === 0) setFilter('all')
  }, [filter, flaggedCount, pinnedCount])

  const twoRows = perRow * 2
  const needsCollapse = filter === 'all' && totalQuestions > twoRows
  const windowStart = calcWindowStart({ needsCollapse, expanded, currentIndex, twoRows, perRow })
  const windowEnd = expanded ? totalQuestions : Math.min(windowStart + twoRows, totalQuestions)
  const squares = buildSquares({
    totalQuestions,
    currentIndex,
    filter,
    questionIds,
    flaggedIds,
    pinnedIds,
    feedbackMap,
    onNavigate,
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
        className="hidden gap-1.5 md:grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(32px, 1fr))' }}
      >
        {squares}
      </div>
      <div className="md:hidden" ref={containerRef}>
        <div
          data-testid="question-grid-mobile"
          className="grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))' }}
        >
          {expanded ? squares : squares.slice(windowStart, windowEnd)}
        </div>
        {needsCollapse && (
          <GridToggle
            expanded={expanded}
            totalQuestions={totalQuestions}
            onToggle={() => setExpanded((v) => !v)}
          />
        )}
      </div>
    </div>
  )
}
