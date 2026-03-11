import type { SubjectDetail } from '@/lib/queries/progress'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SubjectBreakdown } from './subject-breakdown'

function makeSubject(overrides: Partial<SubjectDetail> = {}): SubjectDetail {
  return {
    id: 's1',
    code: 'AGK',
    name: 'Aircraft General Knowledge',
    short: 'AGK',
    totalQuestions: 100,
    answeredCorrectly: 60,
    masteryPercentage: 60,
    topics: [
      {
        id: 't1',
        code: '050-01',
        name: 'Airframe',
        totalQuestions: 50,
        answeredCorrectly: 30,
        masteryPercentage: 60,
      },
    ],
    ...overrides,
  }
}

describe('SubjectBreakdown', () => {
  it('shows empty state message when subjects array is empty', () => {
    render(<SubjectBreakdown subjects={[]} />)
    expect(screen.getByText(/no subjects with questions available yet/i)).toBeInTheDocument()
  })

  it('renders a row for each subject', () => {
    const subjects = [
      makeSubject({ id: 's1', code: 'AGK', name: 'Aircraft General Knowledge' }),
      makeSubject({ id: 's2', code: 'MET', name: 'Meteorology' }),
    ]
    render(<SubjectBreakdown subjects={subjects} />)
    expect(screen.getByText('Aircraft General Knowledge')).toBeInTheDocument()
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
  })

  it('shows the mastery percentage for each subject', () => {
    render(<SubjectBreakdown subjects={[makeSubject({ masteryPercentage: 75 })]} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('shows subject code in the row header', () => {
    render(<SubjectBreakdown subjects={[makeSubject({ code: 'NAV' })]} />)
    expect(screen.getByText('NAV')).toBeInTheDocument()
  })

  it('topics are hidden by default (collapsed)', () => {
    render(<SubjectBreakdown subjects={[makeSubject()]} />)
    expect(screen.queryByText('Airframe')).not.toBeInTheDocument()
  })

  it('shows topics when the subject row is clicked to expand', async () => {
    const user = userEvent.setup()
    render(<SubjectBreakdown subjects={[makeSubject()]} />)
    await user.click(screen.getByRole('button', { name: /aircraft general knowledge/i }))
    expect(screen.getByText('Airframe')).toBeInTheDocument()
  })

  it('toggles back to collapsed when the subject row is clicked again', async () => {
    const user = userEvent.setup()
    render(<SubjectBreakdown subjects={[makeSubject()]} />)
    const btn = screen.getByRole('button', { name: /aircraft general knowledge/i })
    await user.click(btn) // expand
    await user.click(btn) // collapse
    expect(screen.queryByText('Airframe')).not.toBeInTheDocument()
  })

  it('shows "+" indicator when collapsed', () => {
    render(<SubjectBreakdown subjects={[makeSubject()]} />)
    expect(screen.getByText('+')).toBeInTheDocument()
  })

  it('shows "−" indicator when expanded', async () => {
    const user = userEvent.setup()
    render(<SubjectBreakdown subjects={[makeSubject()]} />)
    await user.click(screen.getByRole('button', { name: /aircraft general knowledge/i }))
    expect(screen.getByText('−')).toBeInTheDocument()
  })

  it('shows topic code and mastery percentage in expanded view', async () => {
    const user = userEvent.setup()
    render(
      <SubjectBreakdown
        subjects={[
          makeSubject({
            topics: [
              {
                id: 't1',
                code: '050-01',
                name: 'Airframe',
                totalQuestions: 50,
                answeredCorrectly: 25,
                masteryPercentage: 50,
              },
            ],
          }),
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /aircraft general knowledge/i }))
    expect(screen.getByText('050-01')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('renders nothing for topics when a subject has no topics', async () => {
    const user = userEvent.setup()
    render(<SubjectBreakdown subjects={[makeSubject({ topics: [] })]} />)
    await user.click(screen.getByRole('button', { name: /aircraft general knowledge/i }))
    // No topic rows, just the expanded container
    expect(screen.queryByText('050-01')).not.toBeInTheDocument()
  })
})
