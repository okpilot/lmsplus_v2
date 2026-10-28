import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilterRow, getSquareClassFor, getSquareStatus } from './filter-pill'

function getSquareClass(o: Parameters<typeof getSquareStatus>[0]) {
  return getSquareClassFor(getSquareStatus(o), o.isCurrent)
}

// ---------------------------------------------------------------------------
// getSquareClassFor
// ---------------------------------------------------------------------------

describe('getSquareClassFor', () => {
  it('styles a correct square with success-soft and success text', () => {
    const cls = getSquareClass({ isCurrent: false, isCorrect: true })
    expect(cls).toContain('bg-success-soft text-success')
  })

  it('styles a wrong square with danger-soft and danger text', () => {
    const cls = getSquareClass({ isCurrent: false, isCorrect: false })
    expect(cls).toContain('bg-danger-soft text-danger')
  })

  it('styles an answered-in-exam square with bg-muted', () => {
    const cls = getSquareClass({ isCurrent: false, isCorrect: null, isAnsweredInExam: true })
    expect(cls).toContain('bg-muted')
  })

  it('styles a seen square with bg-muted', () => {
    const cls = getSquareClass({ isCurrent: false, isCorrect: null, isSeen: true })
    expect(cls).toContain('bg-muted')
  })

  it('styles an unseen square with border-border', () => {
    const cls = getSquareClass({ isCurrent: false, isCorrect: null, isSeen: false })
    expect(cls).toContain('border-border')
    expect(cls).toContain('text-muted-foreground')
  })

  it('adds ring-2 ring-primary on the current square', () => {
    const cls = getSquareClass({ isCurrent: true, isCorrect: null })
    expect(cls).toContain('ring-2 ring-primary')
    expect(cls).not.toContain('bg-primary')
  })

  it('keeps the state class on the current square', () => {
    const cls = getSquareClass({ isCurrent: true, isCorrect: true })
    expect(cls).toContain('bg-success-soft')
    expect(cls).toContain('ring-primary')
  })

  it('never emits raw green/red-500 or text-white', () => {
    const combos = [
      { isCurrent: false, isCorrect: true },
      { isCurrent: false, isCorrect: false },
      { isCurrent: true, isCorrect: true },
      { isCurrent: false, isCorrect: null, isSeen: true },
      { isCurrent: false, isCorrect: null, isAnsweredInExam: true },
    ]
    for (const o of combos) expect(getSquareClass(o)).not.toMatch(/(green|red)-500|text-white/)
  })
})

describe('getSquareStatus', () => {
  it('returns unseen with no signals', () => {
    expect(getSquareStatus({ isCurrent: false, isCorrect: null })).toBe('unseen')
  })

  it('returns answered for answered-in-exam', () => {
    expect(getSquareStatus({ isCurrent: false, isCorrect: null, isAnsweredInExam: true })).toBe(
      'answered',
    )
  })

  it('returns answered for a Discovery seen square', () => {
    expect(getSquareStatus({ isCurrent: false, isCorrect: null, isSeen: true })).toBe('answered')
  })

  it('returns correct and wrong from isCorrect', () => {
    expect(getSquareStatus({ isCurrent: false, isCorrect: true })).toBe('correct')
    expect(getSquareStatus({ isCurrent: false, isCorrect: false })).toBe('wrong')
  })

  it('prefers answered over correctness', () => {
    expect(getSquareStatus({ isCurrent: false, isCorrect: true, isAnsweredInExam: true })).toBe(
      'answered',
    )
  })

  it('does not depend on isCurrent', () => {
    expect(getSquareStatus({ isCurrent: true, isCorrect: false })).toBe('wrong')
  })
})

// ---------------------------------------------------------------------------
// FilterRow
// ---------------------------------------------------------------------------

function renderFilterRow(
  overrides: Partial<{
    filter: 'all' | 'flagged' | 'pinned'
    flaggedCount: number
    pinnedCount: number
  }> = {},
) {
  const props = {
    filter: 'all' as const,
    setFilter: vi.fn(),
    flaggedCount: 0,
    pinnedCount: 0,
    ...overrides,
  }
  render(<FilterRow {...props} />)
  return props
}

describe('FilterRow', () => {
  it('always renders the filter row container', () => {
    renderFilterRow()
    expect(screen.getByTestId('grid-filters')).toBeInTheDocument()
  })

  it('always renders the All pill', () => {
    renderFilterRow()
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('does not render Flagged pill when flaggedCount is 0', () => {
    renderFilterRow({ flaggedCount: 0 })
    expect(screen.queryByTestId('filter-flagged')).not.toBeInTheDocument()
  })

  it('does not render Pinned pill when pinnedCount is 0', () => {
    renderFilterRow({ pinnedCount: 0 })
    expect(screen.queryByTestId('filter-pinned')).not.toBeInTheDocument()
  })

  it('renders Flagged pill with count when flaggedCount is greater than 0', () => {
    renderFilterRow({ flaggedCount: 3 })
    const pill = screen.getByTestId('filter-flagged')
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveTextContent('Flagged (3)')
  })

  it('renders Pinned pill with count when pinnedCount is greater than 0', () => {
    renderFilterRow({ pinnedCount: 2 })
    const pill = screen.getByTestId('filter-pinned')
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveTextContent('Pinned (2)')
  })

  it('renders both Flagged and Pinned pills when both counts are greater than 0', () => {
    renderFilterRow({ flaggedCount: 1, pinnedCount: 4 })
    expect(screen.getByTestId('filter-flagged')).toHaveTextContent('Flagged (1)')
    expect(screen.getByTestId('filter-pinned')).toHaveTextContent('Pinned (4)')
  })

  it('calls setFilter with "flagged" when the Flagged pill is clicked', () => {
    const { setFilter } = renderFilterRow({ flaggedCount: 1 })
    fireEvent.click(screen.getByTestId('filter-flagged'))
    expect(setFilter).toHaveBeenCalledWith('flagged')
  })

  it('calls setFilter with "pinned" when the Pinned pill is clicked', () => {
    const { setFilter } = renderFilterRow({ pinnedCount: 1 })
    fireEvent.click(screen.getByTestId('filter-pinned'))
    expect(setFilter).toHaveBeenCalledWith('pinned')
  })

  it('calls setFilter with "all" when the All pill is clicked', () => {
    const { setFilter } = renderFilterRow({ filter: 'flagged', flaggedCount: 1 })
    fireEvent.click(screen.getByText('All'))
    expect(setFilter).toHaveBeenCalledWith('all')
  })
})

describe('FilterRow pills', () => {
  it('sets aria-pressed true on the active filter pill only', () => {
    renderFilterRow({ filter: 'flagged', flaggedCount: 1, pinnedCount: 1 })
    expect(screen.getByTestId('filter-flagged')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('filter-pinned')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('carries the toggle variant selected look on every pill', () => {
    renderFilterRow({ flaggedCount: 1 })
    expect(screen.getByTestId('filter-flagged')).toHaveClass('aria-pressed:border-primary')
    expect(screen.getByRole('button', { name: 'All' })).toHaveClass('aria-pressed:border-primary')
  })
})
