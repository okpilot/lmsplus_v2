import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockToastSuccess = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())
const mockSendEmail = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

vi.mock('../actions/send-code-email', () => ({
  sendInternalExamCodeEmail: mockSendEmail,
}))

import { formatExpiry } from '../_utils/format-expiry'
import { IssuedCodePanel } from './issued-code-panel'

const PROPS = {
  codeId: 'code-1',
  code: 'ABCD2345',
  expiresAt: '2026-04-30T12:00:00.000Z',
  onDismiss: vi.fn(),
}

describe('IssuedCodePanel', () => {
  // Capture and restore the original clipboard descriptor across tests so we
  // never leak a fake `writeText` to sibling specs.
  const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor)
    } else {
      // Some jsdom builds don't define clipboard at all — strip the test fake.
      delete (navigator as unknown as { clipboard?: unknown }).clipboard
    }
  })

  it('displays the issued code in large monospace text', () => {
    render(<IssuedCodePanel {...PROPS} />)
    expect(screen.getByTestId('issued-code-value')).toHaveTextContent('ABCD2345')
  })

  it('shows the expiry timestamp in a human-readable format', () => {
    render(<IssuedCodePanel {...PROPS} />)
    expect(screen.getByText(`Expires ${formatExpiry(PROPS.expiresAt)}`)).toBeInTheDocument()
  })

  it('copies the code to the clipboard and shows a confirmation toast on copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<IssuedCodePanel {...PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: /copy code/i }))
    await Promise.resolve()
    await Promise.resolve()

    expect(writeText).toHaveBeenCalledWith('ABCD2345')
    expect(mockToastSuccess).toHaveBeenCalledWith('Code copied to clipboard')
  })

  it('shows an error toast when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<IssuedCodePanel {...PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: /copy code/i }))
    await Promise.resolve()
    await Promise.resolve()

    expect(mockToastError).toHaveBeenCalledWith('Could not copy code')
  })

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<IssuedCodePanel {...PROPS} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('resets the Copied indicator when the panel is rerendered with a different code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const { rerender } = render(<IssuedCodePanel {...PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: /copy code/i }))
    // findByRole awaits the post-clipboard rerender that flips the label.
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument()

    rerender(<IssuedCodePanel {...PROPS} code="ZZZZ7777" />)
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument()
  })

  it('emails the code to the student and shows a success toast when send succeeds', async () => {
    mockSendEmail.mockResolvedValue({ success: true })
    render(<IssuedCodePanel {...PROPS} />)

    fireEvent.click(screen.getByRole('button', { name: /send via email/i }))
    await Promise.resolve()
    await Promise.resolve()

    expect(mockSendEmail).toHaveBeenCalledWith({ codeId: 'code-1' })
    expect(mockToastSuccess).toHaveBeenCalledWith('Code emailed to student')
  })

  it('shows an error toast when emailing the code fails', async () => {
    mockSendEmail.mockResolvedValue({ success: false, error: 'Code is no longer active' })
    render(<IssuedCodePanel {...PROPS} />)

    fireEvent.click(screen.getByRole('button', { name: /send via email/i }))
    await Promise.resolve()
    await Promise.resolve()

    expect(mockToastError).toHaveBeenCalledWith('Code is no longer active')
  })

  it('disables the send button and labels it "Sent" after a successful send', async () => {
    mockSendEmail.mockResolvedValue({ success: true })
    render(<IssuedCodePanel {...PROPS} />)

    fireEvent.click(screen.getByRole('button', { name: /send via email/i }))
    const sentButton = await screen.findByRole('button', { name: /^sent$/i })
    expect(sentButton).toBeDisabled()

    fireEvent.click(sentButton)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('re-enables the send button when the panel is rerendered with a different code', async () => {
    mockSendEmail.mockResolvedValue({ success: true })
    const { rerender } = render(<IssuedCodePanel {...PROPS} />)

    fireEvent.click(screen.getByRole('button', { name: /send via email/i }))
    expect(await screen.findByRole('button', { name: /^sent$/i })).toBeInTheDocument()

    rerender(<IssuedCodePanel {...PROPS} code="ZZZZ7777" codeId="code-2" />)
    expect(screen.getByRole('button', { name: /send via email/i })).toBeInTheDocument()
  })

  it('shows a generic error toast when the send action throws an unexpected exception', async () => {
    mockSendEmail.mockRejectedValue(new Error('network failure'))
    render(<IssuedCodePanel {...PROPS} />)

    fireEvent.click(screen.getByRole('button', { name: /send via email/i }))
    await Promise.resolve()
    await Promise.resolve()

    expect(mockToastError).toHaveBeenCalledWith('Failed to send email')
    // The button must NOT flip to "Sent" after an exception.
    expect(screen.queryByRole('button', { name: /^sent$/i })).not.toBeInTheDocument()
  })
})
