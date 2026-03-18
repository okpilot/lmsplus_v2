import { render, screen } from '@testing-library/react'
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
    const cells = screen.getAllByTitle(/questions/)
    expect(cells).toHaveLength(31) // March has 31 days
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
