import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyActivity } from '@/lib/queries/analytics'
import { ActivityHeatmap } from './activity-heatmap'

function makeDay(day: string, total: number): DailyActivity {
  return { day, total, correct: total, incorrect: 0 }
}

describe('ActivityHeatmap', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a cell for every day in the current month', () => {
    render(<ActivityHeatmap data={[]} />)
    const cells = screen.getAllByTitle(/\d+ March: \d+ questions/)
    expect(cells).toHaveLength(31) // March has 31 days
  })

  it('renders weekday column headers', () => {
    render(<ActivityHeatmap data={[]} />)
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
  })

  it('shows day numbers inside cells', () => {
    render(<ActivityHeatmap data={[]} />)
    const cell = screen.getByTitle('1 March: 0 questions')
    expect(cell.textContent).toBe('1')
  })

  it('shows bg-muted for a past day with no activity', () => {
    render(<ActivityHeatmap data={[]} />)
    const cells = screen.getAllByTitle(/: 0 questions/)
    expect(cells.length).toBeGreaterThan(0)
    const firstCell = cells[0]
    expect(firstCell).toBeDefined()
    expect(firstCell?.className).toMatch(/bg-muted/)
  })

  it('applies green-200 for activity with total 1-2', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-18', 1)]} />)
    const cell = screen.getByTitle(/18 March: 1 questions/)
    expect(cell.className).toContain('bg-green-200')
  })

  it('applies green-700 for activity with total > 10', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-18', 15)]} />)
    const cell = screen.getByTitle(/18 March: 15 questions/)
    expect(cell.className).toContain('bg-green-700')
  })

  it('marks today with ring-2 ring-primary', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-18', 5)]} />)
    const todayCell = screen.getByTitle(/18 March: 5 questions/)
    expect(todayCell.className).toContain('ring-2')
    expect(todayCell.className).toContain('ring-primary')
  })

  it('renders the month name and year in the header', () => {
    render(<ActivityHeatmap data={[]} />)
    expect(screen.getByText('March 2026')).toBeInTheDocument()
  })
})

describe('ActivityHeatmap — month navigation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('navigates to the previous month when the back button is clicked', () => {
    render(<ActivityHeatmap data={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('February 2026')).toBeInTheDocument()
  })

  it('renders correct number of days after navigating to February', () => {
    render(<ActivityHeatmap data={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    const cells = screen.getAllByTitle(/\d+ February: \d+ questions/)
    expect(cells).toHaveLength(28) // February 2026 has 28 days
  })

  it('navigates back to current month after going forward from previous month', () => {
    render(<ActivityHeatmap data={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('February 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('March 2026')).toBeInTheDocument()
  })

  it('disables the forward button when viewing the current month', () => {
    render(<ActivityHeatmap data={[]} />)
    const nextButton = screen.getByRole('button', { name: 'Next month' })
    expect(nextButton).toBeDisabled()
  })

  it('enables the forward button when viewing a past month', () => {
    render(<ActivityHeatmap data={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    const nextButton = screen.getByRole('button', { name: 'Next month' })
    expect(nextButton).not.toBeDisabled()
  })

  it('marks all days as future (muted/30) when viewing a future-offset month (positive offset)', () => {
    // Navigate back one month; verify past month days do not have today's ring
    render(<ActivityHeatmap data={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    const cells = screen.getAllByTitle(/February/)
    expect(cells.every((c) => !c.className.includes('ring-primary'))).toBe(true)
  })

  it('does not show a today ring on cells when viewing a past month', () => {
    render(<ActivityHeatmap data={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    const cells = screen.getAllByTitle(/\d+ February: \d+ questions/)
    expect(cells.some((c) => c.className.includes('ring-2'))).toBe(false)
  })

  it('shows activity data for the navigated month when data is provided', () => {
    const febActivity: DailyActivity[] = [{ day: '2026-02-14', total: 8, correct: 6, incorrect: 2 }]
    render(<ActivityHeatmap data={febActivity} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    const cell = screen.getByTitle('14 February: 8 questions')
    expect(cell.className).toContain('bg-green-500')
  })

  it('disables the back button after navigating 11 months back', () => {
    render(<ActivityHeatmap data={[]} />)
    const backButton = screen.getByRole('button', { name: 'Previous month' })
    for (let i = 0; i < 11; i++) {
      fireEvent.click(backButton)
    }
    expect(backButton).toBeDisabled()
  })

  it('shows April 2025 after navigating exactly 11 months back from March 2026', () => {
    render(<ActivityHeatmap data={[]} />)
    const backButton = screen.getByRole('button', { name: 'Previous month' })
    for (let i = 0; i < 11; i++) {
      fireEvent.click(backButton)
    }
    expect(screen.getByText('April 2025')).toBeInTheDocument()
  })

  it('does not navigate past the 11-month limit when back button is clicked again', () => {
    render(<ActivityHeatmap data={[]} />)
    const backButton = screen.getByRole('button', { name: 'Previous month' })
    for (let i = 0; i < 15; i++) {
      fireEvent.click(backButton)
    }
    expect(screen.getByText('April 2025')).toBeInTheDocument()
  })
})
