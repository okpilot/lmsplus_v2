import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilterRow, getSquareClass } from './filter-pill'

// ---------------------------------------------------------------------------
// getSquareClass
// ---------------------------------------------------------------------------

describe('getSquareClass', () => {
  it('returns primary styles when isCurrent is true regardless of correctness', () => {
    const cls = getSquareClass({ isCurrent: true, isCorrect: null })
    expect(cls).toContain('bg-primary')
    expect(cls).toContain('text-primary-foreground')
  })

  it('returns primary styles when isCurrent is true and answer is correct', () => {
    const cls = getSquareClass({ isCurrent: true, isCorrect: true })
    expect(cls).toContain('bg-primary')
    expect(cls).not.toContain('bg-green-500')
  })

  it('returns green styles when answer is correct and not current', () => {
    const cls = getSquareClass({ isCurrent: false, isCorrect: true })
    expect(cls).toContain('bg-green-500')
    expect(cls).toContain('text-white')
  })

  it('returns red styles when answer is incorrect and not current', () => {
    const cls = getSquareClass({ isCurrent: false, isCorrect: false })
    expect(cls).toContain('bg-red-500')
    expect(cls).toContain('text-white')
  })

  it('returns border styles when unanswered and not current', () => {
    const cls = getSquareClass({ isCurrent: false, isCorrect: null })
    expect(cls).toContain('border')
    expect(cls).toContain('text-muted-foreground')
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
