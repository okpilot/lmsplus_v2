import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionReport } from '@/lib/queries/reports'
import { SessionTable } from './session-table'

const mockRouterPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string
    children: React.ReactNode
    onClick?: React.MouseEventHandler
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}))

function makeSession(overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    id: 'sess-1',
    mode: 'quick_quiz',
    subjectName: 'Navigation',
    totalQuestions: 10,
    answeredCount: 10,
    correctCount: 8,
    scorePercentage: 80,
    startedAt: '2026-03-10T10:00:00Z',
    endedAt: '2026-03-10T10:15:00Z',
    durationMinutes: 15,
    ...overrides,
  }
}

const mockOnSort = vi.fn()
const SORT_PROPS = { sort: 'date' as const, dir: 'desc' as const, onSort: mockOnSort }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('SessionTable', () => {
  it('renders a row for each session', () => {
    const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })]
    render(<SessionTable sessions={sessions} {...SORT_PROPS} />)
    const rows = screen.getAllByRole('row')
    // 1 header row + 2 data rows
    expect(rows).toHaveLength(3)
  })

  it('displays subject name in the row', () => {
    render(
      <SessionTable {...SORT_PROPS} sessions={[makeSession({ subjectName: 'Meteorology' })]} />,
    )
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
  })

  it('displays correct/total question counts', () => {
    render(
      <SessionTable
        {...SORT_PROPS}
        sessions={[makeSession({ correctCount: 7, totalQuestions: 10 })]}
      />,
    )
    expect(screen.getByText(/7 \/ 10/)).toBeInTheDocument()
  })

  it('displays duration in minutes', () => {
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ durationMinutes: 20 })]} />)
    expect(screen.getByText('20m')).toBeInTheDocument()
  })

  it('displays score percentage rounded to nearest integer', () => {
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ scorePercentage: 66.7 })]} />)
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('displays em dash when scorePercentage is null', () => {
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ scorePercentage: null })]} />)
    expect(screen.getByText('\u2014')).toBeInTheDocument()
  })

  it('renders an Exam badge for mock_exam mode', () => {
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ mode: 'mock_exam' })]} />)
    expect(screen.getByText('Exam')).toBeInTheDocument()
  })

  it('renders mode label for non-exam modes', () => {
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ mode: 'quick_quiz' })]} />)
    expect(screen.getByText('Study')).toBeInTheDocument()
  })

  it('falls back to raw mode string for unknown modes', () => {
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ mode: 'custom_mode' })]} />)
    expect(screen.getByText('custom_mode')).toBeInTheDocument()
  })

  it('links the subject name to the quiz report page', () => {
    render(
      <SessionTable
        {...SORT_PROPS}
        sessions={[makeSession({ id: 'abc-123', subjectName: 'Navigation' })]}
      />,
    )
    const link = screen.getByRole('link', { name: 'Navigation' })
    expect(link).toHaveAttribute('href', '/app/quiz/report?session=abc-123')
  })
})

describe('SessionTable row color-coding', () => {
  it('colors the score cell green when score is >=70%', () => {
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ scorePercentage: 80 })]} />)
    const scoreCell = screen.getByText('80%')
    expect(scoreCell.style.color).toBe('rgb(34, 197, 94)')
  })

  it('colors the score cell amber when score is 50–69%', () => {
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ scorePercentage: 60 })]} />)
    const scoreCell = screen.getByText('60%')
    expect(scoreCell.style.color).toBe('rgb(245, 158, 11)')
  })

  it('colors the score cell red when score is below 50%', () => {
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ scorePercentage: 40 })]} />)
    const scoreCell = screen.getByText('40%')
    expect(scoreCell.style.color).toBe('rgb(239, 68, 68)')
  })

  it('applies no color to the score cell when scorePercentage is null', () => {
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ scorePercentage: null })]} />)
    const scoreCell = screen.getByText('\u2014')
    expect(scoreCell.style.color).toBe('')
  })
})

describe('SessionTable row keyboard navigation', () => {
  it('navigates to the report page when Enter is pressed on a row', async () => {
    const user = userEvent.setup()
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ id: 'row-1' })]} />)
    const row = screen.getAllByRole('row')[1]!
    row.focus()
    await user.keyboard('{Enter}')
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/report?session=row-1')
  })

  it('navigates to the report page when Space is pressed on a row', async () => {
    const user = userEvent.setup()
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ id: 'row-2' })]} />)
    const row = screen.getAllByRole('row')[1]!
    row.focus()
    await user.keyboard(' ')
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/report?session=row-2')
  })

  it('does not navigate when an unrelated key is pressed on a row', async () => {
    const user = userEvent.setup()
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ id: 'row-3' })]} />)
    const row = screen.getAllByRole('row')[1]!
    row.focus()
    await user.keyboard('{Tab}')
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('navigates to the report page when a row is clicked', async () => {
    const user = userEvent.setup()
    render(<SessionTable {...SORT_PROPS} sessions={[makeSession({ id: 'click-1' })]} />)
    const row = screen.getAllByRole('row')[1]!
    await user.click(row)
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/report?session=click-1')
  })
})
