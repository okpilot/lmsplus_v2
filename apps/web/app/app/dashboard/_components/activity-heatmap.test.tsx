import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyActivity } from '@/lib/queries/analytics'
import { ActivityHeatmap } from './activity-heatmap'

function makeDay(day: string, total: number): DailyActivity {
  return { day, total, correct: total, incorrect: 0 }
}

describe('ActivityHeatmap', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders a cell for every day in the current month', () => {
    const now = new Date()
    const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate()
    render(<ActivityHeatmap data={[]} />)
    const cells = screen.getAllByTitle(/questions/)
    expect(cells).toHaveLength(daysInMonth)
  })

  it('shows bg-muted for a past day with no activity', () => {
    render(<ActivityHeatmap data={[]} />)
    // Day 1 of the month is always in the past (or today) — 0 activity gives bg-muted
    const cells = screen.getAllByTitle(/: 0 questions/)
    // At least day 1 should exist as a muted cell (today may have ring added but still bg-muted)
    expect(cells.length).toBeGreaterThan(0)
    // The first cell in the row (day 1) should be muted (not future)
    const firstCell = cells[0]
    expect(firstCell).toBeDefined()
    expect(firstCell?.className).toMatch(/bg-muted/)
  })

  it('applies green-200 for activity with total 1-2', () => {
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    render(<ActivityHeatmap data={[makeDay(`${year}-${month}-${day}`, 1)]} />)
    const cell = screen.getByTitle(/: 1 questions/)
    expect(cell.className).toContain('bg-green-200')
  })

  it('applies green-700 for activity with total > 10', () => {
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    render(<ActivityHeatmap data={[makeDay(`${year}-${month}-${day}`, 15)]} />)
    const cell = screen.getByTitle(/: 15 questions/)
    expect(cell.className).toContain('bg-green-700')
  })

  it('marks today with ring-2 ring-primary', () => {
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    render(<ActivityHeatmap data={[makeDay(`${year}-${month}-${day}`, 5)]} />)
    const todayCell = screen.getByTitle(/: 5 questions/)
    expect(todayCell.className).toContain('ring-2')
    expect(todayCell.className).toContain('ring-primary')
  })

  it('renders the month name and year in the header', () => {
    render(<ActivityHeatmap data={[]} />)
    const now = new Date()
    const monthName = now.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
    const year = now.getUTCFullYear()
    expect(screen.getByText(`${monthName} ${year}`)).toBeInTheDocument()
  })
})
