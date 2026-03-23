import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SessionReport } from '@/lib/queries/reports'
import { ReportsList } from './reports-list'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/reports',
}))

/** Return only <a> links (excludes <tr role="link"> which has no href) */
function getAnchorLinks() {
  return screen.getAllByRole('link').filter((el) => el.tagName === 'A')
}

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

describe('ReportsList', () => {
  it('shows empty state message when sessions array is empty', () => {
    render(<ReportsList sessions={[]} />)
    expect(screen.getByText(/no completed sessions yet/i)).toBeInTheDocument()
  })

  it('renders score for each session', () => {
    const sessions = [
      makeSession({ id: 's1', scorePercentage: 80 }),
      makeSession({ id: 's2', scorePercentage: 60 }),
    ]
    render(<ReportsList sessions={sessions} />)
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('60%').length).toBeGreaterThan(0)
  })

  it('displays score percentage rounded to nearest integer', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: 66.7 })]} />)
    expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
  })

  it('displays em dash when scorePercentage is null', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: null })]} />)
    expect(screen.getAllByText('\u2014').length).toBeGreaterThan(0)
  })

  it('maps quick_quiz mode to "Study" label', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'quick_quiz' })]} />)
    expect(screen.getAllByText('Study').length).toBeGreaterThan(0)
  })

  it('maps smart_review mode to "Study" label', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'smart_review' })]} />)
    expect(screen.getAllByText('Study').length).toBeGreaterThan(0)
  })

  it('renders EXAM badge for mock_exam mode', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'mock_exam' })]} />)
    expect(screen.getAllByText('Exam').length).toBeGreaterThan(0)
    expect(screen.getAllByText('EXAM').length).toBeGreaterThan(0)
  })

  it('falls back to raw mode string for unknown modes', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'custom_mode' })]} />)
    expect(screen.getAllByText('custom_mode').length).toBeGreaterThan(0)
  })

  it('displays subject name in the session', () => {
    render(<ReportsList sessions={[makeSession({ subjectName: 'Meteorology' })]} />)
    expect(screen.getAllByText('Meteorology').length).toBeGreaterThan(0)
  })

  it('shows correct/total question counts and duration', () => {
    render(
      <ReportsList
        sessions={[makeSession({ correctCount: 7, totalQuestions: 10, durationMinutes: 20 })]}
      />,
    )
    expect(screen.getAllByText(/7 \/ 10/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/20m/).length).toBeGreaterThan(0)
  })

  it('links each row to the quiz report page for that session', () => {
    render(<ReportsList sessions={[makeSession({ id: 'abc-123' })]} />)
    const links = getAnchorLinks()
    expect(links.length).toBeGreaterThan(0)
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=abc-123')
  })

  it('color-codes scores green for >=70%', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: 80 })]} />)
    const scoreElements = screen.getAllByText('80%')
    const colored = scoreElements.find((el) => el.style.color === 'rgb(34, 197, 94)')
    expect(colored).toBeDefined()
  })

  it('color-codes scores amber for 50-69%', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: 60 })]} />)
    const scoreElements = screen.getAllByText('60%')
    const colored = scoreElements.find((el) => el.style.color === 'rgb(245, 158, 11)')
    expect(colored).toBeDefined()
  })

  it('color-codes scores red for <50%', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: 40 })]} />)
    const scoreElements = screen.getAllByText('40%')
    const colored = scoreElements.find((el) => el.style.color === 'rgb(239, 68, 68)')
    expect(colored).toBeDefined()
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
    const links = getAnchorLinks()
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=s-new')
  })

  it('toggles date to ascending when Date button is clicked while date sort is active', async () => {
    const user = userEvent.setup()
    render(<ReportsList sessions={[older, newer]} />)
    const dateBtn = screen.getByRole('button', { name: /date/i })
    await user.click(dateBtn)
    const links = getAnchorLinks()
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=s-old')
  })

  it('sorts by score ascending when Score button is clicked', async () => {
    const user = userEvent.setup()
    render(<ReportsList sessions={[older, newer]} />)
    await user.click(screen.getByRole('button', { name: /score/i }))
    const links = getAnchorLinks()
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=s-new')
  })

  it('sorts by score descending when Score button is clicked twice', async () => {
    const user = userEvent.setup()
    render(<ReportsList sessions={[older, newer]} />)
    const scoreBtn = screen.getByRole('button', { name: /score/i })
    await user.click(scoreBtn)
    await user.click(scoreBtn)
    const links = getAnchorLinks()
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=s-old')
  })

  it('sorts by subject alphabetically ascending when Subject button is clicked', async () => {
    const user = userEvent.setup()
    render(<ReportsList sessions={[older, newer]} />)
    await user.click(screen.getByRole('button', { name: /subject/i }))
    const links = getAnchorLinks()
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=s-new')
  })

  it('shows the sort direction arrow on the active sort key', async () => {
    const user = userEvent.setup()
    render(<ReportsList sessions={[older, newer]} />)
    expect(screen.getByRole('button', { name: /date/i }).textContent).toContain('\u2193')
    await user.click(screen.getByRole('button', { name: /score/i }))
    expect(screen.getByRole('button', { name: /score/i }).textContent).toContain('\u2191')
    expect(screen.getByRole('button', { name: /date/i }).textContent).not.toContain('\u2191')
    expect(screen.getByRole('button', { name: /date/i }).textContent).not.toContain('\u2193')
  })
})
