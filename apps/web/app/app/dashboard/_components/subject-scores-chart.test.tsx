import type { SubjectScore } from '@/lib/queries/analytics'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Recharts uses SVG APIs not available in jsdom — stub it out entirely.
vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { SubjectScoresChart } from './subject-scores-chart'

function makeScore(overrides: Partial<SubjectScore> = {}): SubjectScore {
  return {
    subjectId: 's-1',
    subjectName: 'Navigation',
    subjectShort: 'NAV',
    avgScore: 85,
    sessionCount: 3,
    ...overrides,
  }
}

describe('SubjectScoresChart', () => {
  it('shows empty state message when data array is empty', () => {
    render(<SubjectScoresChart data={[]} />)
    expect(screen.getByText(/complete some quizzes/i)).toBeInTheDocument()
  })

  it('renders the pie chart when data is provided', () => {
    render(<SubjectScoresChart data={[makeScore()]} />)
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('renders the "Subject Scores" section heading', () => {
    render(<SubjectScoresChart data={[makeScore()]} />)
    expect(screen.getByText('Subject Scores')).toBeInTheDocument()
  })

  it('renders a legend entry for each subject with its short code and score', () => {
    const data = [
      makeScore({ subjectShort: 'NAV', subjectName: 'Navigation', avgScore: 85 }),
      makeScore({
        subjectId: 's-2',
        subjectShort: 'MET',
        subjectName: 'Meteorology',
        avgScore: 70,
      }),
    ]
    render(<SubjectScoresChart data={data} />)
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
  })

  it('cycles through the COLORS palette without error when there are more than 5 subjects', () => {
    const data = Array.from({ length: 7 }, (_, i) =>
      makeScore({
        subjectId: `s-${i}`,
        subjectShort: `S${i}`,
        subjectName: `Subject ${i}`,
        avgScore: 50,
      }),
    )
    // Should render without throwing even when index exceeds COLORS length
    expect(() => render(<SubjectScoresChart data={data} />)).not.toThrow()
    expect(screen.getAllByText('50%')).toHaveLength(7)
  })
})
