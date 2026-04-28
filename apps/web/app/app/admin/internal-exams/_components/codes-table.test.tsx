import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InternalExamCodeRow } from '../types'

const { mockReplace, mockUseSearchParams } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockUseSearchParams: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: mockUseSearchParams,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (v: string) => void
    children: React.ReactNode
    items?: { value: string; label: string }[]
  }) => (
    <select
      data-testid="status-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
    <button type="button" aria-label={ariaLabel} />
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ''}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

// Mock VoidCodeDialog so clicking Void simply records the codeId.
const { mockDialogProps } = vi.hoisted(() => ({ mockDialogProps: vi.fn() }))
vi.mock('./void-code-dialog', () => ({
  VoidCodeDialog: (props: { codeId: string | null; open: boolean }) => {
    mockDialogProps(props)
    return props.open ? <div data-testid="void-dialog">{props.codeId}</div> : null
  },
}))

import { CodesTable } from './codes-table'

const baseRow: InternalExamCodeRow = {
  id: 'code-1',
  code: 'ABCD-1234-X',
  subjectId: 'subj-1',
  subjectName: 'Air Law',
  studentId: 'stu-1',
  studentName: 'Alice',
  studentEmail: 'alice@example.com',
  issuedBy: 'admin-1',
  issuedAt: '2026-04-28T10:00:00.000Z',
  expiresAt: '2026-04-29T10:00:00.000Z',
  consumedAt: null,
  consumedSessionId: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  status: 'active',
  sessionEndedAt: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseSearchParams.mockReturnValue(new URLSearchParams())
})

describe('CodesTable', () => {
  it('renders empty state when no rows', () => {
    render(<CodesTable rows={[]} />)
    expect(screen.getByText('No codes found')).toBeInTheDocument()
  })

  it('renders code, student, subject', () => {
    render(<CodesTable rows={[baseRow]} />)
    expect(screen.getByText('ABCD-1234-X')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Air Law')).toBeInTheDocument()
  })

  it('shows active status badge for active codes', () => {
    render(<CodesTable rows={[baseRow]} />)
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('shows finished status when consumed and session ended', () => {
    const finished: InternalExamCodeRow = {
      ...baseRow,
      status: 'consumed',
      consumedAt: '2026-04-28T11:00:00.000Z',
      consumedSessionId: 'sess-1',
      sessionEndedAt: '2026-04-28T11:30:00.000Z',
    }
    render(<CodesTable rows={[finished]} />)
    expect(screen.getByText('finished')).toBeInTheDocument()
  })

  it('shows consumed status when consumed but session still in progress', () => {
    const inProg: InternalExamCodeRow = {
      ...baseRow,
      status: 'consumed',
      consumedAt: '2026-04-28T11:00:00.000Z',
      consumedSessionId: 'sess-1',
      sessionEndedAt: null,
    }
    render(<CodesTable rows={[inProg]} />)
    expect(screen.getByText('consumed')).toBeInTheDocument()
  })

  it('disables Void button for finished (session ended) codes', () => {
    const finished: InternalExamCodeRow = {
      ...baseRow,
      status: 'consumed',
      sessionEndedAt: '2026-04-28T11:30:00.000Z',
    }
    render(<CodesTable rows={[finished]} />)
    const btn = screen.getByRole('button', { name: 'Void' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables Void button for already-voided codes', () => {
    const voided: InternalExamCodeRow = {
      ...baseRow,
      status: 'voided',
      voidedAt: '2026-04-28T11:00:00.000Z',
    }
    render(<CodesTable rows={[voided]} />)
    const btn = screen.getByRole('button', { name: 'Void' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables Void for active codes', () => {
    render(<CodesTable rows={[baseRow]} />)
    const btn = screen.getByRole('button', { name: 'Void' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('opens void dialog with the row id when Void is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    render(<CodesTable rows={[baseRow]} />)
    await user.click(screen.getByRole('button', { name: 'Void' }))
    expect(screen.getByTestId('void-dialog').textContent).toBe('code-1')
  })

  it('navigates with status query param when status filter changes', async () => {
    const user = userEvent.setup({ delay: null })
    render(<CodesTable rows={[baseRow]} />)
    await user.selectOptions(screen.getByTestId('status-select'), 'voided')
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/internal-exams?status=voided')
  })

  it('removes status query param when "all" is selected', async () => {
    const user = userEvent.setup({ delay: null })
    mockUseSearchParams.mockReturnValue(new URLSearchParams('status=active'))
    render(<CodesTable rows={[baseRow]} status="active" />)
    await user.selectOptions(screen.getByTestId('status-select'), '__all__')
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/internal-exams?')
  })
})
