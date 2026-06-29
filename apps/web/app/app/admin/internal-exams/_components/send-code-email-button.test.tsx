import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockToastSuccess = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())
const mockSendEmail = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

vi.mock('../actions/send-code-email', () => ({
  sendInternalExamCodeEmail: mockSendEmail,
}))

// ---- Subject under test ---------------------------------------------------

import { SendCodeEmailButton } from './send-code-email-button'

// ---- Fixtures -------------------------------------------------------------

const CODE_ID = 'code-abc-001'
const SENT_ISO = '2026-04-28T10:30:00.000Z'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('SendCodeEmailButton', () => {
  it('renders "Send email" label and no sent indicator when emailedAt is null', () => {
    render(<SendCodeEmailButton codeId={CODE_ID} emailedAt={null} />)

    expect(screen.getByRole('button', { name: /send email/i })).toBeInTheDocument()
    expect(screen.queryByText(/sent/i)).not.toBeInTheDocument()
  })

  it('renders "Resend" label and sent indicator when emailedAt is non-null on mount', () => {
    render(<SendCodeEmailButton codeId={CODE_ID} emailedAt={SENT_ISO} />)

    expect(screen.getByRole('button', { name: /resend/i })).toBeInTheDocument()
    const formatted = new Date(SENT_ISO).toLocaleString('en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
    expect(screen.getByText(`Sent ${formatted}`)).toBeInTheDocument()
  })

  it('shows the sent indicator, success toast, and flips label to "Resend" after a successful send', async () => {
    mockSendEmail.mockResolvedValue({ success: true })
    render(<SendCodeEmailButton codeId={CODE_ID} emailedAt={null} />)

    fireEvent.click(screen.getByRole('button', { name: /send email/i }))

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Code emailed to student'))
    expect(mockSendEmail).toHaveBeenCalledWith({ codeId: CODE_ID })
    expect(await screen.findByRole('button', { name: /resend/i })).toBeInTheDocument()
    expect(screen.getByText(/^Sent /)).toBeInTheDocument()
  })

  it('shows an error toast and does NOT show the sent indicator when the action returns success:false', async () => {
    mockSendEmail.mockResolvedValue({ success: false, error: 'Code is no longer active' })
    render(<SendCodeEmailButton codeId={CODE_ID} emailedAt={null} />)

    fireEvent.click(screen.getByRole('button', { name: /send email/i }))
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Code is no longer active'))

    // sentAt must not have been set — no "Sent …" indicator
    expect(screen.queryByText(/^Sent /)).not.toBeInTheDocument()
  })

  it('does not send when disabled (non-active code)', () => {
    render(<SendCodeEmailButton codeId={CODE_ID} emailedAt={null} disabled />)

    const button = screen.getByRole('button', { name: /send email/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('shows the generic error toast and does NOT show the sent indicator when the action throws', async () => {
    mockSendEmail.mockRejectedValue(new Error('network failure'))
    render(<SendCodeEmailButton codeId={CODE_ID} emailedAt={null} />)

    fireEvent.click(screen.getByRole('button', { name: /send email/i }))
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to send email'))

    expect(screen.queryByText(/^Sent /)).not.toBeInTheDocument()
  })
})
