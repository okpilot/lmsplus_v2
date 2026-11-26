import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReplace = vi.hoisted(() => vi.fn())
const mockSearch = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams',
  useSearchParams: () => new URLSearchParams(mockSearch.value),
}))
vi.mock('../sittings/_components/sittings-tab', () => ({
  SittingsTab: () => <div>sittings content</div>,
}))
vi.mock('./attempts-table', () => ({ AttemptsTable: () => <div>attempts content</div> }))
const mockCodesTableProps = vi.hoisted(() => vi.fn())
vi.mock('./codes-table', () => ({
  CodesTable: (props: unknown) => {
    mockCodesTableProps(props)
    return <div>codes content</div>
  },
}))

import { InternalExamsTabs } from './internal-exams-tabs'

/** A non-empty row: an empty `codes` array cannot tell row forwarding from a dropped prop. */
const CODE_ROW = {
  id: 'code-1',
  code: 'ABC12345',
  subjectId: 'subj-1',
  subjectName: 'Flight Planning',
  studentId: 'stu-1',
  studentName: 'Fixture Student',
  studentEmail: 'stu@test.local',
  issuedBy: 'admin-1',
  issuedAt: '2026-11-01T00:00:00Z',
  expiresAt: '2026-12-01T00:00:00Z',
  consumedAt: null,
  consumedSessionId: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  emailedAt: null,
  status: 'active',
  sittingId: null,
  sittingEntryId: null,
  sessionEndedAt: null,
  sessionDeletedAt: null,
} as const

function renderTabs() {
  return render(
    <InternalExamsTabs
      codes={[]}
      codesTotalCount={0}
      attempts={[]}
      attemptsTotalCount={0}
      pageSize={20}
    />,
  )
}

beforeEach(() => {
  mockReplace.mockReset()
  mockCodesTableProps.mockReset()
  mockSearch.value = ''
})

describe('InternalExamsTabs', () => {
  it('exposes the tab testids and marks the active tab with aria-selected', () => {
    renderTabs()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByTestId('tab-sittings')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tab-codes')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('tab-attempts')).toHaveAttribute('aria-selected', 'false')
  })

  it('orders the tabs Sittings, Codes, Attempts', () => {
    renderTabs()
    const ids = screen.getAllByRole('tab').map((t) => t.getAttribute('data-testid'))
    expect(ids).toEqual(['tab-sittings', 'tab-codes', 'tab-attempts'])
  })

  it('writes the clicked tab to the URL instead of local state', async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByTestId('tab-attempts'))
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace.mock.calls[0]?.[0]).toContain('tab=attempts')
  })

  it('navigates again after the URL tab changes (Back, then another tab)', async () => {
    const user = userEvent.setup()
    mockSearch.value = 'tab=codes'
    const view = renderTabs()
    await user.click(screen.getByTestId('tab-attempts'))
    expect(mockReplace).toHaveBeenCalledTimes(1)
    // Back: the URL still says codes, then the user picks attempts again after a different pick.
    await user.click(screen.getByTestId('tab-sittings'))
    expect(mockReplace).toHaveBeenCalledTimes(2)
    mockSearch.value = 'tab=sittings'
    view.rerender(
      <InternalExamsTabs
        codes={[]}
        codesTotalCount={0}
        attempts={[]}
        attemptsTotalCount={0}
        pageSize={20}
      />,
    )
    await user.click(screen.getByTestId('tab-codes'))
    expect(mockReplace).toHaveBeenCalledTimes(3)
    expect(mockReplace.mock.calls[2]?.[0]).toContain('tab=codes')
  })

  it('re-arms the tab guard when a non-tab navigation supersedes the tab request', async () => {
    const user = userEvent.setup()
    const view = renderTabs()
    await user.click(screen.getByTestId('tab-attempts'))
    expect(mockReplace).toHaveBeenCalledTimes(1)
    mockSearch.value = 'page=2'
    view.rerender(
      <InternalExamsTabs
        codes={[]}
        codesTotalCount={0}
        attempts={[]}
        attemptsTotalCount={0}
        pageSize={20}
      />,
    )
    await user.click(screen.getByTestId('tab-attempts'))
    expect(mockReplace).toHaveBeenCalledTimes(2)
    expect(mockReplace.mock.calls[1]?.[0]).toBe('/app/admin/internal-exams?tab=attempts')
  })

  it('selects the attempts tab from ?tab=attempts', () => {
    mockSearch.value = 'tab=attempts'
    renderTabs()
    expect(screen.getByTestId('tab-attempts')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tabpanel-attempts')).toBeInTheDocument()
  })

  it('selects the sittings tab from ?tab=sittings and lists it first', () => {
    mockSearch.value = 'tab=sittings'
    renderTabs()
    expect(screen.getByTestId('tab-sittings')).toHaveAttribute('aria-selected', 'true')
    const tabs = screen.getAllByRole('tab').map((t) => t.getAttribute('data-testid'))
    expect(tabs).toEqual(['tab-sittings', 'tab-codes', 'tab-attempts'])
  })

  it('passes the codes rows, status filter and pagination totals to the codes table', () => {
    mockSearch.value = 'tab=codes'
    render(
      <InternalExamsTabs
        status="active"
        codes={[CODE_ROW]}
        codesTotalCount={42}
        attempts={[]}
        attemptsTotalCount={0}
        pageSize={20}
      />,
    )
    expect(mockCodesTableProps).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [CODE_ROW],
        status: 'active',
        totalCount: 42,
        pageSize: 20,
      }),
    )
  })

  it('styles the active tab with the shared segmented look', () => {
    renderTabs()
    expect(screen.getByTestId('tab-codes')).toHaveClass('data-active:border-primary')
  })
})
