import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardKpis } from '../types'
import { KpiCards } from './kpi-cards'

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

  it('shows the empty state in the shared empty part', () => {
    const { container } = render(
      <KpiCards data={buildKpis({ totalStudents: 0, activeStudents: 0 })} range="30d" />,
    )
    expect(container.querySelector('[data-slot="empty"]')).toHaveTextContent(
      'No students enrolled yet',
    )
  })

  it('renders each KPI as a stat card', () => {
    const { container } = render(<KpiCards data={buildKpis()} range="30d" />)
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(5)
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

  it.each([40, 65, 89])('renders %i avg mastery without danger, caution or success colour', (m) => {
    render(<KpiCards data={buildKpis({ avgMastery: m })} range="30d" />)
    const value = screen.getByText(`${m}%`)
    expect(value.className).not.toMatch(/text-(danger|caution|success)/)
  })

  it('applies the success colour when avg mastery reaches 90', () => {
    render(<KpiCards data={buildKpis({ avgMastery: 90 })} range="30d" />)
    expect(screen.getByText('90%').className).toContain('text-success')
  })

  it('keeps one column on a phone and steps to three then five columns on wider screens', () => {
    render(<KpiCards data={buildKpis()} range="30d" />)
    const grid = screen.getByText('Active Students').closest('.grid') as HTMLElement
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toContain('md:grid-cols-3')
    expect(grid.className).toContain('2xl:grid-cols-5')
    expect(grid.className).not.toContain('sm:grid-cols-2')
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

  it('sets the weakest subject name body-size bold and wraps long names inside the card', () => {
    render(<KpiCards data={buildKpis()} range="30d" />)
    const value = screen.getByText('Meteorology')
    expect(value.className).toContain('text-body')
    expect(value.className).toContain('font-semibold')
    expect(value.className).toContain('break-words')
    expect(value.className).not.toContain('text-stat')
    expect(value.className).not.toContain('text-heading')
  })

  it('renders an em dash when weakest subject is null', () => {
    render(<KpiCards data={buildKpis({ weakestSubject: null })} range="30d" />)
    // The em dash is rendered as the weakest subject value
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a 30% weakest subject without danger or caution colour', () => {
    render(
      <KpiCards
        data={buildKpis({ weakestSubject: { name: 'MET', short: 'MET', avgMastery: 30 } })}
        range="30d"
      />,
    )
    expect(screen.getByText('MET').className).not.toMatch(/text-(danger|caution)/)
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
