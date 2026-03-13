import type { SessionReport } from '@/lib/queries/reports'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ReportsList } from './reports-list'

function makeSession(overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    id: 'sess-1',
    mode: 'quick_quiz',
    subjectName: 'Navigation',
    totalQuestions: 10,
    correctCount: 8,
    scorePercentage: 80,
    startedAt: '2026-03-10T10:00:00Z',
    endedAt: '2026-03-10T10:15:00Z',
    durationMinutes: 15,
    ...overrides,
  }
}

describe('ReportsList', () => {
  it('shows empty state message when sessions array is empty', () => {
    render(<ReportsList sessions={[]} />)
    expect(screen.getByText(/no completed sessions yet/i)).toBeInTheDocument()
  })

  it('renders a row for each session', () => {
    const sessions = [
      makeSession({ id: 's1', scorePercentage: 80 }),
      makeSession({ id: 's2', scorePercentage: 60 }),
    ]
    render(<ReportsList sessions={sessions} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('displays score percentage rounded to nearest integer', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: 66.7 })]} />)
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('displays em dash when scorePercentage is null', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: null })]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('maps quick_quiz mode to "Quiz" label', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'quick_quiz', subjectName: null })]} />)
    expect(screen.getByText('Quiz')).toBeInTheDocument()
  })

  it('maps smart_review mode to "Smart Review" label', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'smart_review', subjectName: null })]} />)
    expect(screen.getByText('Smart Review')).toBeInTheDocument()
  })

  it('maps mock_exam mode to "Mock Exam" label', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'mock_exam', subjectName: null })]} />)
    expect(screen.getByText('Mock Exam')).toBeInTheDocument()
  })

  it('falls back to raw mode string for unknown modes', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'custom_mode', subjectName: null })]} />)
    expect(screen.getByText('custom_mode')).toBeInTheDocument()
  })

  it('appends subject name to the mode label when present', () => {
    render(
      <ReportsList sessions={[makeSession({ mode: 'quick_quiz', subjectName: 'Meteorology' })]} />,
    )
    expect(screen.getByText(/Quiz — Meteorology/)).toBeInTheDocument()
  })

  it('shows correct/total question counts and duration', () => {
    render(
      <ReportsList
        sessions={[makeSession({ correctCount: 7, totalQuestions: 10, durationMinutes: 20 })]}
      />,
    )
    expect(screen.getByText(/7\/10 correct/)).toBeInTheDocument()
    expect(screen.getByText(/20min/)).toBeInTheDocument()
  })

  it('links each row to the quiz report page for that session', () => {
    render(<ReportsList sessions={[makeSession({ id: 'abc-123' })]} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/app/quiz/report?session=abc-123')
  })
})

describe('ReportsList sorting', () => {
  const older = makeSession({
    id: 's-old',
    startedAt: '2026-03-01T10:00:00Z',
    scorePercentage: 90,
    subjectName: 'Zulu',
  })
  const newer = makeSession({
    id: 's-new',
    startedAt: '2026-03-12T10:00:00Z',
    scorePercentage: 50,
    subjectName: 'Alpha',
  })

  it('defaults to date descending — newest session appears first', () => {
    render(<ReportsList sessions={[older, newer]} />)
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=s-new')
    expect(links[1]).toHaveAttribute('href', '/app/quiz/report?session=s-old')
  })

  it('toggles date to ascending when Date button is clicked twice', async () => {
    const user = userEvent.setup()
    render(<ReportsList sessions={[older, newer]} />)
    const dateBtn = screen.getByRole('button', { name: /date/i })
    await user.click(dateBtn) // first click on active key → flip to asc
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=s-old')
    expect(links[1]).toHaveAttribute('href', '/app/quiz/report?session=s-new')
  })

  it('sorts by score ascending when Score button is clicked', async () => {
    const user = userEvent.setup()
    render(<ReportsList sessions={[older, newer]} />)
    await user.click(screen.getByRole('button', { name: /score/i }))
    const links = screen.getAllByRole('link')
    // newer has 50%, older has 90% — ascending puts 50% first
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=s-new')
    expect(links[1]).toHaveAttribute('href', '/app/quiz/report?session=s-old')
  })

  it('sorts by score descending when Score button is clicked twice', async () => {
    const user = userEvent.setup()
    render(<ReportsList sessions={[older, newer]} />)
    const scoreBtn = screen.getByRole('button', { name: /score/i })
    await user.click(scoreBtn) // asc
    await user.click(scoreBtn) // desc
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=s-old') // 90%
    expect(links[1]).toHaveAttribute('href', '/app/quiz/report?session=s-new') // 50%
  })

  it('sorts by subject alphabetically ascending when Subject button is clicked', async () => {
    const user = userEvent.setup()
    render(<ReportsList sessions={[older, newer]} />)
    await user.click(screen.getByRole('button', { name: /subject/i }))
    const links = screen.getAllByRole('link')
    // Alpha < Zulu
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=s-new')
    expect(links[1]).toHaveAttribute('href', '/app/quiz/report?session=s-old')
  })

  it('shows the sort direction arrow on the active sort key', async () => {
    const user = userEvent.setup()
    render(<ReportsList sessions={[older, newer]} />)
    // Default: date desc — the Date button should show a down arrow
    expect(screen.getByRole('button', { name: /date/i }).textContent).toContain('↓')
    // Switch to score
    await user.click(screen.getByRole('button', { name: /score/i }))
    expect(screen.getByRole('button', { name: /score/i }).textContent).toContain('↑')
    // Date button should no longer show an arrow
    expect(screen.getByRole('button', { name: /date/i }).textContent).not.toContain('↑')
    expect(screen.getByRole('button', { name: /date/i }).textContent).not.toContain('↓')
  })
})
