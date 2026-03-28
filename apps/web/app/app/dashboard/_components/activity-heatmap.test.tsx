import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyActivity } from '@/lib/queries/analytics'
import { ActivityHeatmap } from './activity-heatmap'

function makeDay(day: string, total: number, correct = total, incorrect = 0): DailyActivity {
  return { day, total, correct, incorrect }
}

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

describe('ActivityHeatmap', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'))
  })

  afterEach(() => {
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
    // Blue total, green correct, red incorrect should all be present
    const blueNumbers = document.querySelectorAll('.text-blue-500')
    const greenNumbers = document.querySelectorAll('.text-green-500')
    const redNumbers = document.querySelectorAll('.text-red-500')
    expect(blueNumbers.length).toBeGreaterThan(0)
    expect(greenNumbers.length).toBeGreaterThan(0)
    expect(redNumbers.length).toBeGreaterThan(0)
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
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'))
  })

  afterEach(() => {
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
