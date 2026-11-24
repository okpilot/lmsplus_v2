import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyCodeButton } from './copy-code-button'

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

const writeText = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(options: Parameters<typeof userEvent.setup>[0] = {}) {
  const user = userEvent.setup(options)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  render(<CopyCodeButton code="ABC123" label="Copy code for Ann" />)
  return user
}

describe('CopyCodeButton', () => {
  it('copies the code and announces it', async () => {
    writeText.mockResolvedValue(undefined)
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Copy code for Ann' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Code copied'))
    expect(writeText).toHaveBeenCalledWith('ABC123')
    expect(toastError).not.toHaveBeenCalled()
  })

  it('toasts an error and announces nothing when the clipboard write fails', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Copy code for Ann' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(toastError).toHaveBeenCalledWith('Could not copy the code.')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('keeps announcing for the full window after a second copy', async () => {
    vi.useFakeTimers()
    writeText.mockResolvedValue(undefined)
    setup()
    const button = screen.getByRole('button', { name: 'Copy code for Ann' })
    await act(async () => button.click())
    await act(() => vi.advanceTimersByTimeAsync(1500))
    await act(async () => button.click())
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.getByRole('status')).toHaveTextContent('Code copied')
    await act(() => vi.advanceTimersByTimeAsync(1100))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
