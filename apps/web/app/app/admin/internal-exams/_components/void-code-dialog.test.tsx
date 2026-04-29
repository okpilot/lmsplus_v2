import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../actions/void-code', () => ({
  voidInternalExamCode: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { toast } from 'sonner'
import { voidInternalExamCode } from '../actions/void-code'
import { VoidCodeDialog } from './void-code-dialog'

const CODE_ID = '00000000-0000-4000-a000-000000000001'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('VoidCodeDialog', () => {
  it('does not render dialog content when closed', () => {
    render(<VoidCodeDialog codeId={CODE_ID} open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders title, reason textarea, and submit button when open', () => {
    render(<VoidCodeDialog codeId={CODE_ID} open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('Void internal exam code')).toBeInTheDocument()
    expect(screen.getByLabelText('Reason')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Void code' })).toBeInTheDocument()
  })

  it('disables submit when reason is empty', () => {
    render(<VoidCodeDialog codeId={CODE_ID} open={true} onOpenChange={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Void code' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables submit when codeId is null', async () => {
    render(<VoidCodeDialog codeId={null} open={true} onOpenChange={vi.fn()} />)
    const user = userEvent.setup({ delay: null })
    await user.type(screen.getByLabelText('Reason'), 'because')
    const btn = screen.getByRole('button', { name: 'Void code' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables submit when reason is provided and codeId is set', async () => {
    render(<VoidCodeDialog codeId={CODE_ID} open={true} onOpenChange={vi.fn()} />)
    const user = userEvent.setup({ delay: null })
    await user.type(screen.getByLabelText('Reason'), 'rescheduled')
    const btn = screen.getByRole('button', { name: 'Void code' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('calls voidInternalExamCode with codeId and trimmed reason on submit', async () => {
    vi.mocked(voidInternalExamCode).mockResolvedValue({
      success: true,
      codeId: CODE_ID,
      sessionId: null,
      sessionEnded: false,
    })
    const user = userEvent.setup({ delay: null })
    render(<VoidCodeDialog codeId={CODE_ID} open={true} onOpenChange={vi.fn()} />)

    await user.type(screen.getByLabelText('Reason'), '  Student requested  ')
    await user.click(screen.getByRole('button', { name: 'Void code' }))

    await waitFor(() => {
      expect(voidInternalExamCode).toHaveBeenCalledWith({
        codeId: CODE_ID,
        reason: 'Student requested',
      })
    })
  })

  it('closes dialog and shows success toast on success (no active session)', async () => {
    vi.mocked(voidInternalExamCode).mockResolvedValue({
      success: true,
      codeId: CODE_ID,
      sessionId: null,
      sessionEnded: false,
    })
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ delay: null })
    render(<VoidCodeDialog codeId={CODE_ID} open={true} onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText('Reason'), 'reason')
    await user.click(screen.getByRole('button', { name: 'Void code' }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Code voided')
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows session-ended toast and closes dialog when sessionEnded is true', async () => {
    vi.mocked(voidInternalExamCode).mockResolvedValue({
      success: true,
      codeId: CODE_ID,
      sessionId: 'sess-1',
      sessionEnded: true,
    })
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ delay: null })
    render(<VoidCodeDialog codeId={CODE_ID} open={true} onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText('Reason'), 'reason')
    await user.click(screen.getByRole('button', { name: 'Void code' }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Code voided and active session ended')
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows inline error message and keeps dialog open on failure', async () => {
    vi.mocked(voidInternalExamCode).mockResolvedValue({
      success: false,
      error: 'Cannot void a finished attempt — record is final',
    })
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ delay: null })
    render(<VoidCodeDialog codeId={CODE_ID} open={true} onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText('Reason'), 'reason')
    await user.click(screen.getByRole('button', { name: 'Void code' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'Cannot void a finished attempt — record is final',
      )
    })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('shows generic error and keeps dialog open when action throws', async () => {
    vi.mocked(voidInternalExamCode).mockRejectedValue(new Error('Network'))
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ delay: null })
    render(<VoidCodeDialog codeId={CODE_ID} open={true} onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText('Reason'), 'reason')
    await user.click(screen.getByRole('button', { name: 'Void code' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Failed to void internal exam code')
    })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup({ delay: null })
    render(<VoidCodeDialog codeId={CODE_ID} open={true} onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
