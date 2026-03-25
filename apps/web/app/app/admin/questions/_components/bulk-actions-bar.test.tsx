import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockBulkUpdateStatus, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockBulkUpdateStatus: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('../actions/bulk-update-status', () => ({
  bulkUpdateStatus: (...args: unknown[]) => mockBulkUpdateStatus(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

// ---- Subject under test ----------------------------------------------------

import { BulkActionsBar } from './bulk-actions-bar'

// ---- Tests -----------------------------------------------------------------

describe('BulkActionsBar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders nothing when the selected count is 0', () => {
    const { container } = render(<BulkActionsBar selectedIds={[]} onClear={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the selected count when at least one id is provided', () => {
    render(<BulkActionsBar selectedIds={['q-1', 'q-2']} onClear={vi.fn()} />)
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('renders Activate and Deactivate buttons when count is greater than 0', () => {
    render(<BulkActionsBar selectedIds={['q-1']} onClear={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
  })

  it('calls bulkUpdateStatus with status "active" and the selected ids when Activate is clicked', async () => {
    mockBulkUpdateStatus.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(<BulkActionsBar selectedIds={['q-1', 'q-2']} onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockBulkUpdateStatus).toHaveBeenCalledWith({
      ids: ['q-1', 'q-2'],
      status: 'active',
    })
  })

  it('calls bulkUpdateStatus with status "draft" when Deactivate is clicked', async () => {
    mockBulkUpdateStatus.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(<BulkActionsBar selectedIds={['q-1']} onClear={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Deactivate' }))

    expect(mockBulkUpdateStatus).toHaveBeenCalledWith({
      ids: ['q-1'],
      status: 'draft',
    })
  })

  it('shows a success toast and calls onClear when bulkUpdateStatus succeeds', async () => {
    mockBulkUpdateStatus.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(<BulkActionsBar selectedIds={['q-1', 'q-2']} onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockToastSuccess).toHaveBeenCalledWith('2 questions set to active')
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('shows a singular toast label when exactly one question is selected', async () => {
    mockBulkUpdateStatus.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(<BulkActionsBar selectedIds={['q-1']} onClear={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockToastSuccess).toHaveBeenCalledWith('1 question set to active')
  })

  it('shows an error toast and does not call onClear when bulkUpdateStatus returns an error', async () => {
    mockBulkUpdateStatus.mockResolvedValue({ success: false, error: 'No questions were updated' })
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(<BulkActionsBar selectedIds={['q-1']} onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockToastError).toHaveBeenCalledWith('No questions were updated')
    expect(onClear).not.toHaveBeenCalled()
  })

  it('shows a generic error toast when bulkUpdateStatus throws', async () => {
    mockBulkUpdateStatus.mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(<BulkActionsBar selectedIds={['q-1']} onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: 'Activate' }))

    expect(mockToastError).toHaveBeenCalledWith('Bulk update failed')
    expect(onClear).not.toHaveBeenCalled()
  })

  it('calls onClear when the Clear button is clicked', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(<BulkActionsBar selectedIds={['q-1']} onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
