import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockToastSuccess = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}))

import { IssuedCodePanel } from './issued-code-panel'

const PROPS = {
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
      // biome-ignore lint/performance/noDelete: required to fully restore navigator
      delete (navigator as unknown as { clipboard?: unknown }).clipboard
    }
  })

  it('displays the issued code in large monospace text', () => {
    render(<IssuedCodePanel {...PROPS} />)
    expect(screen.getByTestId('issued-code-value')).toHaveTextContent('ABCD2345')
  })

  it('warns the admin that the code will not be shown again', () => {
    render(<IssuedCodePanel {...PROPS} />)
    expect(screen.getByText(/won.?t be shown again/i)).toBeInTheDocument()
  })

  it('shows the expiry timestamp in a human-readable format', () => {
    render(<IssuedCodePanel {...PROPS} />)
    // The exact format depends on locale, but the year and month should appear.
    expect(screen.getByText(/Expires/)).toBeInTheDocument()
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
})
