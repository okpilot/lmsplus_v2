import type { DailyActivity } from '@/lib/queries/analytics'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActivityHeatmap } from './activity-heatmap'

function makeDay(day: string, total: number): DailyActivity {
  return { day, total, correct: total, incorrect: 0 }
}

describe('ActivityHeatmap', () => {
  it('renders null when data array is empty', () => {
    const { container } = render(<ActivityHeatmap data={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a cell for each day in the data', () => {
    const data = [makeDay('2026-03-01', 5), makeDay('2026-03-02', 10), makeDay('2026-03-03', 20)]
    render(<ActivityHeatmap data={data} />)
    // Each cell has a title attribute like "1 Mar: N questions"
    expect(screen.getAllByTitle(/questions/)).toHaveLength(3)
  })

  it('applies muted class for zero activity (total = 0)', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-01', 0)]} />)
    const cell = screen.getByTitle(/0 questions/)
    expect(cell.className).toContain('bg-muted')
  })

  it('applies green-200 class for low activity (total = 1 to 5)', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-01', 3)]} />)
    const cell = screen.getByTitle(/3 questions/)
    expect(cell.className).toContain('bg-green-200')
  })

  it('applies green-300 class for medium-low activity (total = 6 to 15)', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-01', 10)]} />)
    const cell = screen.getByTitle(/10 questions/)
    expect(cell.className).toContain('bg-green-300')
  })

  it('applies green-400 class for medium activity (total = 16 to 30)', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-01', 25)]} />)
    const cell = screen.getByTitle(/25 questions/)
    expect(cell.className).toContain('bg-green-400')
  })

  it('applies green-500 class for medium-high activity (total = 31 to 50)', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-01', 40)]} />)
    const cell = screen.getByTitle(/40 questions/)
    expect(cell.className).toContain('bg-green-500')
  })

  it('applies green-600 class for high activity (total > 50)', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-01', 51)]} />)
    const cell = screen.getByTitle(/51 questions/)
    expect(cell.className).toContain('bg-green-600')
  })

  it('renders the boundary value of 5 as green-200 (not muted)', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-01', 5)]} />)
    const cell = screen.getByTitle(/5 questions/)
    expect(cell.className).toContain('bg-green-200')
    expect(cell.className).not.toContain('bg-muted')
  })

  it('renders the boundary value of 15 as green-300', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-01', 15)]} />)
    const cell = screen.getByTitle(/15 questions/)
    expect(cell.className).toContain('bg-green-300')
  })

  it('renders the "Study Streak" heading', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-01', 1)]} />)
    expect(screen.getByText('Study Streak')).toBeInTheDocument()
  })

  it('formats the tooltip date in en-GB locale (e.g. "1 Mar")', () => {
    render(<ActivityHeatmap data={[makeDay('2026-03-01', 7)]} />)
    // title should include "1 Mar"
    expect(screen.getByTitle(/1 Mar/)).toBeInTheDocument()
  })
})
