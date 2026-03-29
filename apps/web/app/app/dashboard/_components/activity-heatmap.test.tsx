import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyActivity } from '@/lib/queries/analytics'
import { ActivityHeatmap } from './activity-heatmap'

function makeDay(day: string, total: number, correct = total, incorrect = 0): DailyActivity {
  return { day, total, correct, incorrect }
}

// jsdom doesn't implement scrollIntoView
const originalScrollIntoView = Element.prototype.scrollIntoView

describe('ActivityHeatmap', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'))
  })

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView
    vi.useRealTimers()
  })

  it('renders a day number for every day in the current month', () => {
    render(<ActivityHeatmap data={[]} />)
    // March has 31 days — each rendered as a text node
    for (let d = 1; d <= 31; d++) {
      expect(screen.getByText(String(d))).toBeInTheDocument()
    }
  })

  it('shows the Daily Progress header', () => {
    render(<ActivityHeatmap data={[]} />)
    expect(screen.getByRole('heading', { name: 'Daily Progress' })).toBeInTheDocument()
  })

  it('shows em dash for a past day with no activity', () => {
    render(<ActivityHeatmap data={[]} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('shows total/correct/incorrect numbers for a day with activity', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-10', 8, 6, 2)]} />)
    // Find the cell for day 10 and verify its specific values
    const dayLabel = screen.getByText('10')
    const cell = dayLabel.closest('div')!.querySelector('div')!
    expect(cell.querySelector('.text-blue-500')?.textContent).toBe('8')
    expect(cell.querySelector('.text-green-500')?.textContent).toBe('6')
    expect(cell.querySelector('.text-red-500')?.textContent).toBe('2')
  })

  it('marks today with ring-2 ring-primary', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-18', 5)]} />)
    // Day 18 cell should have the ring
    const cells = document.querySelectorAll('[class*="ring-primary"]')
    expect(cells.length).toBe(1)
  })

  it('renders the month name and year in the header', () => {
    render(<ActivityHeatmap data={[]} />)
    expect(screen.getByText('March 2026')).toBeInTheDocument()
  })
})

describe('ActivityHeatmap — month navigation', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'))
  })

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView
    vi.useRealTimers()
  })

  it('navigates to the previous month when the back button is clicked', () => {
    render(<ActivityHeatmap data={[]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Previous month' })[0]!)
    expect(screen.getByText('February 2026')).toBeInTheDocument()
  })

  it('navigates back to current month after going forward from previous month', () => {
    render(<ActivityHeatmap data={[]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Previous month' })[0]!)
    expect(screen.getByText('February 2026')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Next month' })[0]!)
    expect(screen.getByText('March 2026')).toBeInTheDocument()
  })

  it('disables the forward button when viewing the current month', () => {
    render(<ActivityHeatmap data={[]} />)
    const nextButtons = screen.getAllByRole('button', { name: 'Next month' })
    for (const btn of nextButtons) {
      expect(btn).toBeDisabled()
    }
  })

  it('enables the forward button when viewing a past month', () => {
    render(<ActivityHeatmap data={[]} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Previous month' })[0]!)
    const nextButtons = screen.getAllByRole('button', { name: 'Next month' })
    expect(nextButtons.some((btn) => !btn.hasAttribute('disabled'))).toBe(true)
  })

  it('disables the back button after navigating 11 months back', () => {
    render(<ActivityHeatmap data={[]} />)
    const backButton = screen.getAllByRole('button', { name: 'Previous month' })[0]!
    for (let i = 0; i < 11; i++) {
      fireEvent.click(backButton)
    }
    const allBackButtons = screen.getAllByRole('button', { name: 'Previous month' })
    for (const btn of allBackButtons) {
      expect(btn).toBeDisabled()
    }
  })

  it('shows April 2025 after navigating exactly 11 months back from March 2026', () => {
    render(<ActivityHeatmap data={[]} />)
    const backButton = screen.getAllByRole('button', { name: 'Previous month' })[0]!
    for (let i = 0; i < 11; i++) {
      fireEvent.click(backButton)
    }
    expect(screen.getByText('April 2025')).toBeInTheDocument()
  })
})
