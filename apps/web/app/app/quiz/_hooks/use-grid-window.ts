'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_PER_ROW = 9

type UseGridWindowOpts = {
  /** Minimum square size (px) — must match the grid's `minmax(<n>px, 1fr)`. */
  minSquare: number
  /** Gap between squares (px) — must match the grid's `gap`. */
  gap: number
  totalQuestions: number
  currentIndex: number
  /** Whether windowing may collapse (the unfiltered "all" view only). */
  enabled: boolean
}

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

/**
 * Limits a question-navigator grid to two visible rows with a "See all" toggle.
 * Measures the grid container (ResizeObserver) to derive how many squares fit
 * per row, keeps the current question in view while collapsed, and exposes the
 * slice window. Used once per breakpoint — the mobile and desktop grids have
 * different square sizes, so each call gets its own container ref and expand
 * state.
 */
export function useGridWindow({
  minSquare,
  gap,
  totalQuestions,
  currentIndex,
  enabled,
}: UseGridWindowOpts) {
  const [expanded, setExpanded] = useState(false)
  const [perRow, setPerRow] = useState(DEFAULT_PER_ROW)
  const containerRef = useRef<HTMLDivElement>(null)

  const measure = useCallback(() => {
    const width = containerRef.current?.offsetWidth ?? 0
    // Skip while hidden (display:none → width 0 on the inactive breakpoint),
    // so a hidden grid keeps its last good perRow instead of collapsing to 1.
    if (width === 0) return
    setPerRow(Math.max(Math.floor((width + gap) / (minSquare + gap)), 1))
  }, [gap, minSquare])

  useEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    const el = containerRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [measure])

  const twoRows = perRow * 2
  const needsCollapse = enabled && totalQuestions > twoRows
  const windowStart = calcWindowStart({ needsCollapse, expanded, currentIndex, twoRows, perRow })
  const windowEnd = expanded ? totalQuestions : Math.min(windowStart + twoRows, totalQuestions)

  return {
    containerRef,
    expanded,
    setExpanded,
    needsCollapse,
    /** True when the grid is currently showing only its two-row window. */
    collapsed: needsCollapse && !expanded,
    windowStart,
    windowEnd,
  }
}
