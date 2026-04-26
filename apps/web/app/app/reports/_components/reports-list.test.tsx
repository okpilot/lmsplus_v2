import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionReport } from '@/lib/queries/reports'
import { ReportsList } from './reports-list'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/app/reports',
}))

// Mock Base UI Select to avoid portal complexity in jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string
    onValueChange?: (v: string) => void
    children: React.ReactNode
    items?: { value: string; label: string }[]
  }) => (
    <select
      data-testid="mobile-sort-select"
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
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

const DEFAULT_PROPS = {
  page: 1,
  totalCount: 1,
  pageSize: 10,
  sort: 'date' as const,
  dir: 'desc' as const,
}

describe('ReportsList', () => {
  it('shows empty state message when sessions array is empty and totalCount is 0', () => {
    render(<ReportsList sessions={[]} {...DEFAULT_PROPS} totalCount={0} />)
    expect(screen.getByText(/no completed sessions yet/i)).toBeInTheDocument()
  })

  it('renders score for each session', () => {
    const sessions = [
      makeSession({ id: 's1', scorePercentage: 80 }),
      makeSession({ id: 's2', scorePercentage: 60 }),
    ]
    render(<ReportsList sessions={sessions} {...DEFAULT_PROPS} totalCount={2} />)
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('60%').length).toBeGreaterThan(0)
  })

  it('displays score percentage rounded to nearest integer', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: 66.7 })]} {...DEFAULT_PROPS} />)
    expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
  })

  it('displays em dash when scorePercentage is null', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: null })]} {...DEFAULT_PROPS} />)
    expect(screen.getAllByText('\u2014').length).toBeGreaterThan(0)
  })

  it('maps quick_quiz mode to "Study" label', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'quick_quiz' })]} {...DEFAULT_PROPS} />)
    expect(screen.getAllByText('Study').length).toBeGreaterThan(0)
  })

  it('maps smart_review mode to "Study" label', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'smart_review' })]} {...DEFAULT_PROPS} />)
    expect(screen.getAllByText('Study').length).toBeGreaterThan(0)
  })

  it('renders Practice Exam badge for mock_exam mode', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'mock_exam' })]} {...DEFAULT_PROPS} />)
    expect(screen.getAllByText('Practice Exam').length).toBeGreaterThan(0)
  })

  it('falls back to raw mode string for unknown modes', () => {
    render(<ReportsList sessions={[makeSession({ mode: 'custom_mode' })]} {...DEFAULT_PROPS} />)
    expect(screen.getAllByText('custom_mode').length).toBeGreaterThan(0)
  })

  it('displays subject name in the session', () => {
    render(
      <ReportsList sessions={[makeSession({ subjectName: 'Meteorology' })]} {...DEFAULT_PROPS} />,
    )
    expect(screen.getAllByText('Meteorology').length).toBeGreaterThan(0)
  })

  it('shows correct/total question counts and duration', () => {
    render(
      <ReportsList
        sessions={[makeSession({ correctCount: 7, totalQuestions: 10, durationMinutes: 20 })]}
        {...DEFAULT_PROPS}
      />,
    )
    expect(screen.getAllByText(/7 \/ 10/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/20m/).length).toBeGreaterThan(0)
  })

  it('links each row to the quiz report page for that session', () => {
    render(<ReportsList sessions={[makeSession({ id: 'abc-123' })]} {...DEFAULT_PROPS} />)
    const links = getAnchorLinks()
    expect(links.length).toBeGreaterThan(0)
    expect(links[0]).toHaveAttribute('href', '/app/quiz/report?session=abc-123')
  })

  it('color-codes scores green for >=70%', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: 80 })]} {...DEFAULT_PROPS} />)
    const scoreElements = screen.getAllByText('80%')
    const colored = scoreElements.find((el) => el.style.color === 'rgb(34, 197, 94)')
    expect(colored).toBeDefined()
  })

  it('color-codes scores amber for 50-69%', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: 60 })]} {...DEFAULT_PROPS} />)
    const scoreElements = screen.getAllByText('60%')
    const colored = scoreElements.find((el) => el.style.color === 'rgb(245, 158, 11)')
    expect(colored).toBeDefined()
  })

  it('color-codes scores red for <50%', () => {
    render(<ReportsList sessions={[makeSession({ scorePercentage: 40 })]} {...DEFAULT_PROPS} />)
    const scoreElements = screen.getAllByText('40%')
    const colored = scoreElements.find((el) => el.style.color === 'rgb(239, 68, 68)')
    expect(colored).toBeDefined()
  })
})

describe('ReportsList sort via table headers', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    Object.defineProperty(window, 'location', {
      value: { search: '?sort=date&dir=desc' },
      writable: true,
    })
  })

  it('shows descending indicator on the active sort column header', () => {
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={1}
        totalCount={1}
        pageSize={10}
        sort="date"
        dir="desc"
      />,
    )
    expect(screen.getByRole('button', { name: /date/i }).textContent).toContain('▼')
  })

  it('shows ascending indicator when dir is asc', () => {
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={1}
        totalCount={1}
        pageSize={10}
        sort="date"
        dir="asc"
      />,
    )
    expect(screen.getByRole('button', { name: /date/i }).textContent).toContain('▲')
  })

  it('toggles sort direction when active column header is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={1}
        totalCount={1}
        pageSize={10}
        sort="date"
        dir="desc"
      />,
    )
    await user.click(screen.getByRole('button', { name: /date/i }))
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const url = mockReplace.mock.calls[0]?.[0] as string
    const params = new URL(url, 'http://x').searchParams
    expect(params.get('dir')).toBe('asc')
    expect(params.get('sort')).toBe('date')
  })

  it('resets to page 1 when sort changes via column header', async () => {
    const user = userEvent.setup()
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={2}
        totalCount={20}
        pageSize={10}
        sort="date"
        dir="desc"
      />,
    )
    await user.click(screen.getByRole('button', { name: /score/i }))
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const url = mockReplace.mock.calls[0]?.[0] as string
    const params = new URL(url, 'http://x').searchParams
    expect(params.get('sort')).toBe('score')
    expect(params.get('dir')).toBe('asc')
    expect(params.has('page')).toBe(false)
  })

  it('does not show indicator on inactive column headers', () => {
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={1}
        totalCount={1}
        pageSize={10}
        sort="date"
        dir="desc"
      />,
    )
    expect(screen.getByRole('button', { name: /score/i }).textContent).not.toContain('▲')
    expect(screen.getByRole('button', { name: /score/i }).textContent).not.toContain('▼')
  })

  it('shows ascending indicator on subject column when sorted by subject asc', () => {
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={1}
        totalCount={1}
        pageSize={10}
        sort="subject"
        dir="asc"
      />,
    )
    expect(screen.getByRole('button', { name: /subject/i }).textContent).toContain('▲')
  })

  it('switches to subject sort when subject header is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={1}
        totalCount={1}
        pageSize={10}
        sort="date"
        dir="desc"
      />,
    )
    await user.click(screen.getByRole('button', { name: /subject/i }))
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const url = mockReplace.mock.calls[0]?.[0] as string
    const params = new URL(url, 'http://x').searchParams
    expect(params.get('sort')).toBe('subject')
    expect(params.get('dir')).toBe('asc')
    expect(params.has('page')).toBe(false)
  })
})

describe('ReportsList mobile sort dropdown', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    Object.defineProperty(window, 'location', {
      value: { search: '?sort=date&dir=desc' },
      writable: true,
    })
  })

  it('renders the mobile sort select with the current sort value as the selected option', () => {
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={1}
        totalCount={1}
        pageSize={10}
        sort="date"
        dir="desc"
      />,
    )
    expect(screen.getByTestId('mobile-sort-select')).toHaveValue('date-desc')
  })

  it('reflects score-asc as the current value when sort=score and dir=asc', () => {
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={1}
        totalCount={1}
        pageSize={10}
        sort="score"
        dir="asc"
      />,
    )
    expect(screen.getByTestId('mobile-sort-select')).toHaveValue('score-asc')
  })

  it('applies selected sort option from mobile dropdown', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    })
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={1}
        totalCount={1}
        pageSize={10}
        sort="date"
        dir="desc"
      />,
    )
    fireEvent.change(screen.getByTestId('mobile-sort-select'), {
      target: { value: 'score-asc' },
    })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const url = mockReplace.mock.calls[0]?.[0] as string
    const params = new URL(url, 'http://x').searchParams
    expect(params.get('sort')).toBe('score')
    expect(params.get('dir')).toBe('asc')
  })

  it('resets to page 1 when a mobile sort option is selected', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?page=3' },
      writable: true,
    })
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={3}
        totalCount={30}
        pageSize={10}
        sort="date"
        dir="desc"
      />,
    )
    fireEvent.change(screen.getByTestId('mobile-sort-select'), {
      target: { value: 'subject-asc' },
    })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const url = mockReplace.mock.calls[0]?.[0] as string
    const params = new URL(url, 'http://x').searchParams
    expect(params.has('page')).toBe(false)
  })

  it('sorts by subject descending when subject-desc is selected from mobile dropdown', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    })
    render(
      <ReportsList
        sessions={[makeSession()]}
        page={1}
        totalCount={1}
        pageSize={10}
        sort="date"
        dir="desc"
      />,
    )
    fireEvent.change(screen.getByTestId('mobile-sort-select'), {
      target: { value: 'subject-desc' },
    })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const url = mockReplace.mock.calls[0]?.[0] as string
    const params = new URL(url, 'http://x').searchParams
    expect(params.get('sort')).toBe('subject')
    expect(params.get('dir')).toBe('desc')
  })
})
