import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { InternalExamAttemptRow } from '../types'

const { mockPush, mockReplace, mockUseSearchParams } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockUseSearchParams: vi.fn(() => new URLSearchParams()),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/app/admin/internal-exams',
  useSearchParams: mockUseSearchParams,
}))

vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  CircleAlert: () => <span data-testid="icon-circle-alert" />,
  CircleCheck: () => <span data-testid="icon-circle-check" />,
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    prefetch,
  }: {
    href: string
    children: React.ReactNode
    onClick?: (e: React.MouseEvent) => void
    prefetch?: boolean
  }) => (
    <a href={href} onClick={onClick} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}))

import { AttemptsTable } from './attempts-table'

const baseRow: InternalExamAttemptRow = {
  sessionId: 'sess-1',
  studentId: 'stu-1',
  studentName: 'Alice',
  studentEmail: 'alice@example.com',
  subjectId: 'subj-1',
  subjectName: 'Air Law',
  startedAt: '2026-04-28T10:00:00.000Z',
  endedAt: '2026-04-28T10:30:00.000Z',
  totalQuestions: 16,
  correctCount: 14,
  // Deliberately distinct from both correctCount and totalQuestions so the fraction
  // assertion below can only pass by reading answeredItems, not by coincidence.
  answeredItems: 18,
  scorePercentage: 87.5,
  passed: true,
  voidReason: null,
}

describe('AttemptsTable', () => {
  it('renders empty state when no rows', () => {
    render(<AttemptsTable rows={[]} totalCount={0} pageSize={25} />)
    expect(screen.getByText('No attempts yet')).toBeInTheDocument()
  })

  it('does not prefetch the report link', () => {
    render(<AttemptsTable rows={[baseRow]} totalCount={0} pageSize={25} />)
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('data-prefetch', 'false')
  })

  it('renders the empty message with the shared empty description', () => {
    render(<AttemptsTable rows={[]} totalCount={0} pageSize={25} />)
    expect(screen.getByText('No attempts yet')).toHaveAttribute('data-slot', 'empty-description')
  })

  it('renders student name as a link to the report page with sessionId', () => {
    render(<AttemptsTable rows={[baseRow]} totalCount={0} pageSize={25} />)
    const link = screen.getByRole('link', { name: 'Alice' })
    expect(link.getAttribute('href')).toBe('/app/admin/internal-exams/report?session=sess-1')
  })

  it('renders subject name', () => {
    render(<AttemptsTable rows={[baseRow]} totalCount={0} pageSize={25} />)
    expect(screen.getByText('Air Law')).toBeInTheDocument()
  })

  it('renders score rounded to whole percent', () => {
    render(<AttemptsTable rows={[baseRow]} totalCount={0} pageSize={25} />)
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('renders Passed as success status text with a check symbol', () => {
    render(<AttemptsTable rows={[baseRow]} totalCount={0} pageSize={25} />)
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByTestId('icon-circle-check')).toBeInTheDocument()
  })

  it('renders Failed as danger status text with an alert symbol', () => {
    render(<AttemptsTable rows={[{ ...baseRow, passed: false }]} totalCount={0} pageSize={25} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByTestId('icon-circle-alert')).toBeInTheDocument()
  })

  it('renders dash for passed when null', () => {
    render(<AttemptsTable rows={[{ ...baseRow, passed: null }]} totalCount={0} pageSize={25} />)
    expect(screen.queryByText('Passed')).toBeNull()
    expect(screen.queryByText('Failed')).toBeNull()
  })

  it('renders the correct-count over answered-items fraction', () => {
    render(<AttemptsTable rows={[baseRow]} totalCount={0} pageSize={25} />)
    expect(screen.getByText('14 / 18')).toBeInTheDocument()
  })

  it('renders an em dash instead of a fraction when no items were answered', () => {
    render(<AttemptsTable rows={[{ ...baseRow, answeredItems: 0 }]} totalCount={0} pageSize={25} />)
    // The em-dash presence check alone is only non-vacuous while no OTHER cell in this row
    // renders one — every other '—' site (subject, dates, score, passed) is populated in
    // baseRow. Pin the fraction cell directly so a later fixture change can't quietly make
    // this pass on a neighbouring dash while the guard is gone.
    expect(screen.queryByText(/^\d+ \/ \d+$/)).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('falls back to email when student name is empty', () => {
    render(<AttemptsTable rows={[{ ...baseRow, studentName: '' }]} totalCount={0} pageSize={25} />)
    const link = screen.getByRole('link', { name: 'alice@example.com' })
    expect(link.getAttribute('href')).toBe('/app/admin/internal-exams/report?session=sess-1')
  })

  it('renders dash for null score', () => {
    render(
      <AttemptsTable rows={[{ ...baseRow, scorePercentage: null }]} totalCount={0} pageSize={25} />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('navigates to the admin report when the row is clicked', () => {
    mockPush.mockClear()
    render(<AttemptsTable rows={[baseRow]} totalCount={0} pageSize={25} />)
    fireEvent.click(screen.getByRole('link', { name: 'Alice' }).closest('tr') as HTMLElement)
    expect(mockPush).toHaveBeenCalledWith('/app/admin/internal-exams/report?session=sess-1')
  })

  it('shows pagination controls when attempts span more than one page', () => {
    render(<AttemptsTable rows={[baseRow]} totalCount={60} pageSize={25} />)
    expect(screen.getByLabelText('Next page')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–25 of 60 attempts')).toBeInTheDocument()
  })

  it('hides pagination controls when all attempts fit on one page', () => {
    render(<AttemptsTable rows={[baseRow]} totalCount={25} pageSize={25} />)
    expect(screen.queryByLabelText('Next page')).not.toBeInTheDocument()
  })

  it('reads the current page from the attemptsPage search param', () => {
    mockUseSearchParams.mockReturnValueOnce(new URLSearchParams('attemptsPage=2'))
    render(<AttemptsTable rows={[baseRow]} totalCount={60} pageSize={25} />)
    expect(screen.getByText('Showing 26–50 of 60 attempts')).toBeInTheDocument()
  })
})

describe('AttemptsTable — UTC date columns', () => {
  it('labels Started and Ended headers (UTC)', () => {
    render(<AttemptsTable rows={[baseRow]} totalCount={0} pageSize={25} />)
    expect(screen.getByRole('columnheader', { name: 'Started (UTC)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Ended (UTC)' })).toBeInTheDocument()
  })

  it('renders date cells without a UTC label', () => {
    render(<AttemptsTable rows={[baseRow]} totalCount={0} pageSize={25} />)
    const row = screen.getByText('Alice').closest('tr') as HTMLElement
    expect(row.textContent).toContain('28/04/2026')
    expect(row.textContent).not.toContain('UTC')
  })
})

describe('AttemptsTable: Sitting column and filtered empty state', () => {
  const sittingRow: InternalExamAttemptRow = {
    ...baseRow,
    sittingId: 'sit-7',
    sittingAt: '2026-05-01T09:00:00.000Z',
  }
  const legacyRow: InternalExamAttemptRow = { ...baseRow, sittingId: null, sittingAt: null }

  it('has a Sitting column header', () => {
    render(<AttemptsTable rows={[sittingRow]} totalCount={0} pageSize={25} />)
    expect(screen.getByRole('columnheader', { name: /Sitting/ })).toBeInTheDocument()
  })

  it('links the sitting date to the sitting page', () => {
    render(<AttemptsTable rows={[sittingRow]} totalCount={0} pageSize={25} />)
    const link = screen.getByRole('link', { name: /01\/05\/2026/ })
    expect(link.getAttribute('href')).toBe('/app/admin/internal-exams/sittings/sit-7')
  })

  it('does not navigate to the report when the sitting link is clicked', () => {
    mockPush.mockClear()
    render(<AttemptsTable rows={[sittingRow]} totalCount={0} pageSize={25} />)
    fireEvent.click(screen.getByRole('link', { name: /01\/05\/2026/ }))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('renders no sitting link for a legacy attempt', () => {
    render(<AttemptsTable rows={[legacyRow]} totalCount={0} pageSize={25} />)
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs.some((h) => h?.includes('/sittings/'))).toBe(false)
  })

  it('spans the empty-state cell over all 8 columns', () => {
    render(<AttemptsTable rows={[]} totalCount={0} pageSize={25} />)
    const cell = screen.getByText('No attempts yet').closest('td') as HTMLElement
    expect(cell.getAttribute('colspan')).toBe('8')
  })

  it('says no attempts match when a filter is set and there are no rows', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('q=zzz'))
    render(<AttemptsTable rows={[]} totalCount={0} pageSize={25} />)
    mockUseSearchParams.mockReturnValue(new URLSearchParams())
    expect(screen.getByText('No attempts match these filters.')).toBeInTheDocument()
  })
})
