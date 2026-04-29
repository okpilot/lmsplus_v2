import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockIssue = vi.hoisted(() => vi.fn())
const mockToastSuccess = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())

vi.mock('../actions/issue-code', () => ({
  issueInternalExamCode: mockIssue,
}))

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

// Render Base UI Select as a native <select> so jsdom can drive it deterministically.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string
    onValueChange?: (v: string) => void
    disabled?: boolean
    children: React.ReactNode
    items?: { value: string; label: string }[]
  }) => (
    <select
      data-testid="select"
      data-value={value}
      disabled={disabled}
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

import { IssueCodeForm } from './issue-code-form'

const STUDENTS = [
  { id: 'stu-1', fullName: 'Alice', email: 'alice@example.com' },
  { id: 'stu-2', fullName: 'Bob', email: 'bob@example.com' },
]
const SUBJECTS = [
  { id: 'sub-1', code: '050', name: 'Meteorology' },
  { id: 'sub-2', code: '040', name: 'Human Performance' },
]

function renderForm(props: Partial<React.ComponentProps<typeof IssueCodeForm>> = {}) {
  const onIssued = vi.fn()
  const utils = render(
    <IssueCodeForm students={STUDENTS} subjects={SUBJECTS} onIssued={onIssued} {...props} />,
  )
  return { ...utils, onIssued }
}

describe('IssueCodeForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('disables the submit button until both student and subject are selected', () => {
    renderForm()
    const submit = screen.getByRole('button', { name: /issue code/i })
    expect(submit).toBeDisabled()
  })

  it('does not call the action when submitted without selections', () => {
    renderForm()
    fireEvent.submit(screen.getByTestId('issue-code-form'))
    expect(mockIssue).not.toHaveBeenCalled()
  })

  it('submits the action with the selected student and subject ids', async () => {
    mockIssue.mockResolvedValue({
      success: true,
      codeId: 'code-1',
      code: 'ABCD2345',
      expiresAt: '2026-04-30T12:00:00.000Z',
    })
    const { onIssued } = renderForm()

    const [studentSel, subjectSel] = screen.getAllByTestId('select') as HTMLSelectElement[]
    fireEvent.change(studentSel!, { target: { value: 'stu-1' } })
    fireEvent.change(subjectSel!, { target: { value: 'sub-1' } })

    fireEvent.submit(screen.getByTestId('issue-code-form'))

    // wait microtask
    await Promise.resolve()
    await Promise.resolve()

    expect(mockIssue).toHaveBeenCalledWith({ studentId: 'stu-1', subjectId: 'sub-1' })
    expect(onIssued).toHaveBeenCalledWith({
      code: 'ABCD2345',
      expiresAt: '2026-04-30T12:00:00.000Z',
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Internal exam code issued')
  })

  it('shows an error toast and does not call onIssued when the action fails', async () => {
    mockIssue.mockResolvedValue({ success: false, error: 'Configure exam for this subject first' })
    const { onIssued } = renderForm()

    const [studentSel, subjectSel] = screen.getAllByTestId('select') as HTMLSelectElement[]
    fireEvent.change(studentSel!, { target: { value: 'stu-1' } })
    fireEvent.change(subjectSel!, { target: { value: 'sub-1' } })
    fireEvent.submit(screen.getByTestId('issue-code-form'))

    await Promise.resolve()
    await Promise.resolve()

    expect(mockToastError).toHaveBeenCalledWith('Configure exam for this subject first')
    expect(onIssued).not.toHaveBeenCalled()
  })

  it('disables the selects when there are no students or subjects available', () => {
    renderForm({ students: [], subjects: [] })
    const selects = screen.getAllByTestId('select') as HTMLSelectElement[]
    expect(selects[0]).toBeDisabled()
    expect(selects[1]).toBeDisabled()
  })
})
