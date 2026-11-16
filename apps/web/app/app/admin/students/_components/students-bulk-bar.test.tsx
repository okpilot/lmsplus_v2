import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAdd, mockRemove, mockToast, mockRefresh } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockRemove: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockRefresh: vi.fn(),
}))

vi.mock('../actions/add-group-members', () => ({ addGroupMembers: mockAdd }))
vi.mock('../actions/remove-group-members', () => ({ removeGroupMembers: mockRemove }))
vi.mock('sonner', () => ({ toast: mockToast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (v: string) => void
    children: React.ReactNode
  }) => (
    <select aria-label="Group" value={value ?? ''} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

import { StudentsBulkBar } from './students-bulk-bar'

const G1 = 'a0000000-0000-4000-8000-000000000001'
const IDS = ['b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002']
const GROUPS = [{ id: G1, name: 'Cohort A' }]

function setup(selectedIds: string[] = IDS) {
  const onClear = vi.fn()
  const onDone = vi.fn()
  render(
    <StudentsBulkBar selectedIds={selectedIds} groups={GROUPS} onClear={onClear} onDone={onDone} />,
  )
  return { onClear, onDone }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('StudentsBulkBar', () => {
  it('renders nothing when no student is selected', () => {
    setup([])
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it('shows the selected count and the Add, Remove and Clear controls', () => {
    setup()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to group' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove from group' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('adds the selection to the chosen group, toasts the count and reports the submitted ids', async () => {
    const user = userEvent.setup({ delay: null })
    mockAdd.mockResolvedValue({ success: true, count: 2 })
    const { onDone } = setup()
    await user.selectOptions(screen.getByLabelText('Group'), G1)
    await user.click(screen.getByRole('button', { name: 'Add to group' }))
    expect(mockAdd).toHaveBeenCalledWith({ groupId: G1, userIds: IDS })
    expect(mockToast.success).toHaveBeenCalledWith('Added 2 students to Cohort A')
    expect(onDone).toHaveBeenCalledWith(IDS)
  })

  it('toasts that the students are already members when the count is 0', async () => {
    const user = userEvent.setup({ delay: null })
    mockAdd.mockResolvedValue({ success: true, count: 0 })
    setup()
    await user.selectOptions(screen.getByLabelText('Group'), G1)
    await user.click(screen.getByRole('button', { name: 'Add to group' }))
    expect(mockToast.success).toHaveBeenCalledWith('Selected students are already in Cohort A')
  })

  it('removes the selection from the chosen group and toasts the count', async () => {
    const user = userEvent.setup({ delay: null })
    mockRemove.mockResolvedValue({ success: true, count: 1 })
    setup()
    await user.selectOptions(screen.getByLabelText('Group'), G1)
    await user.click(screen.getByRole('button', { name: 'Remove from group' }))
    expect(mockRemove).toHaveBeenCalledWith({ groupId: G1, userIds: IDS })
    expect(mockToast.success).toHaveBeenCalledWith('Removed 1 student from Cohort A')
  })

  it('shows the error as a toast and keeps the selection on failure', async () => {
    const user = userEvent.setup({ delay: null })
    mockAdd.mockResolvedValue({
      success: false,
      error: 'Some selected students are inactive or not found',
    })
    const { onDone } = setup()
    await user.selectOptions(screen.getByLabelText('Group'), G1)
    await user.click(screen.getByRole('button', { name: 'Add to group' }))
    expect(mockToast.error).toHaveBeenCalledWith('Some selected students are inactive or not found')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('calls onClear when Clear is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    const { onClear } = setup()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalled()
  })
})
