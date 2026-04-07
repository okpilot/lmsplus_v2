import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardKpis } from '../types'
import { KpiCards } from './kpi-cards'

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

function buildKpis(overrides: Partial<DashboardKpis> = {}): DashboardKpis {
  return {
    activeStudents: 8,
    totalStudents: 10,
    avgMastery: 72,
    sessionsThisPeriod: 42,
    weakestSubject: { name: 'Meteorology', short: 'MET', avgMastery: 35 },
    examReadyStudents: 3,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('KpiCards', () => {
  it('renders empty-state message when totalStudents is 0', () => {
    render(<KpiCards data={buildKpis({ totalStudents: 0, activeStudents: 0 })} range="30d" />)
    expect(screen.getByText('No students enrolled yet')).toBeInTheDocument()
  })

  it('does not render KPI cards in the empty state', () => {
    render(<KpiCards data={buildKpis({ totalStudents: 0, activeStudents: 0 })} range="30d" />)
    expect(screen.queryByText(/Active Students/i)).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Active students card
  // -------------------------------------------------------------------------

  it('renders active students as a fraction of total students', () => {
    render(<KpiCards data={buildKpis({ activeStudents: 8, totalStudents: 10 })} range="30d" />)
    expect(screen.getByText('8 / 10')).toBeInTheDocument()
  })

  it('renders the correct range label for 7d range', () => {
    render(<KpiCards data={buildKpis()} range="7d" />)
    // "in last 7 days" sub-text is rendered twice (Active Students + Sessions)
    expect(screen.getAllByText(/7 days/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the correct range label for 30d range', () => {
    render(<KpiCards data={buildKpis()} range="30d" />)
    expect(screen.getAllByText(/30 days/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the correct range label for 90d range', () => {
    render(<KpiCards data={buildKpis()} range="90d" />)
    expect(screen.getAllByText(/90 days/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the correct range label for "all" range', () => {
    render(<KpiCards data={buildKpis()} range="all" />)
    expect(screen.getAllByText(/all time/).length).toBeGreaterThanOrEqual(1)
  })

  // -------------------------------------------------------------------------
  // Avg Mastery card — colour thresholds
  // -------------------------------------------------------------------------

  it('applies red colour class when avg mastery is below 50', () => {
    render(<KpiCards data={buildKpis({ avgMastery: 40 })} range="30d" />)
    const value = screen.getByText('40%')
    expect(value.className).toContain('text-red-600')
  })

  it('applies amber colour class when avg mastery is 50–79', () => {
    render(<KpiCards data={buildKpis({ avgMastery: 65 })} range="30d" />)
    const value = screen.getByText('65%')
    expect(value.className).toContain('text-amber-600')
  })

  it('applies green colour class when avg mastery is 80 or above', () => {
    render(<KpiCards data={buildKpis({ avgMastery: 85 })} range="30d" />)
    const value = screen.getByText('85%')
    expect(value.className).toContain('text-green-600')
  })

  it('applies amber colour class at the 50% mastery boundary', () => {
    render(<KpiCards data={buildKpis({ avgMastery: 50 })} range="30d" />)
    const value = screen.getByText('50%')
    expect(value.className).toContain('text-amber-600')
  })

  it('applies green colour class at the 80% mastery boundary', () => {
    render(<KpiCards data={buildKpis({ avgMastery: 80 })} range="30d" />)
    const value = screen.getByText('80%')
    expect(value.className).toContain('text-green-600')
  })

  // -------------------------------------------------------------------------
  // Sessions card
  // -------------------------------------------------------------------------

  it('renders sessions this period count', () => {
    render(<KpiCards data={buildKpis({ sessionsThisPeriod: 42 })} range="30d" />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Weakest subject card
  // -------------------------------------------------------------------------

  it('renders weakest subject name when present', () => {
    render(<KpiCards data={buildKpis()} range="30d" />)
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
  })

  it('renders an em dash when weakest subject is null', () => {
    render(<KpiCards data={buildKpis({ weakestSubject: null })} range="30d" />)
    // The em dash is rendered as the weakest subject value
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('applies red colour to weakest subject when its avg mastery is below 50', () => {
    render(
      <KpiCards
        data={buildKpis({ weakestSubject: { name: 'MET', short: 'MET', avgMastery: 30 } })}
        range="30d"
      />,
    )
    const subjectName = screen.getByText('MET')
    expect(subjectName.className).toContain('text-red-600')
  })

  it('renders weakest subject mastery sub-text when subject is present', () => {
    render(<KpiCards data={buildKpis()} range="30d" />)
    expect(screen.getByText('35% avg mastery')).toBeInTheDocument()
  })

  it('does not render avg mastery sub-text when weakest subject is null', () => {
    render(<KpiCards data={buildKpis({ weakestSubject: null })} range="30d" />)
    expect(screen.queryByText(/avg mastery/)).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Exam Readiness card
  // -------------------------------------------------------------------------

  it('renders exam ready students as a fraction of total students', () => {
    render(<KpiCards data={buildKpis({ examReadyStudents: 3, totalStudents: 10 })} range="30d" />)
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })

  it('renders "students at 90%+" sub-text for exam readiness', () => {
    render(<KpiCards data={buildKpis()} range="30d" />)
    expect(screen.getByText('students at 90%+')).toBeInTheDocument()
  })
})
