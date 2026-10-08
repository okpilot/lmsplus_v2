import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GlobalError from './global-error'

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
}))

describe('GlobalError', () => {
  const testError = new Error('Global render failure')
  const mockRetry = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the error heading', () => {
    render(<GlobalError error={testError} retry={mockRetry} />)
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
  })

  it('renders a descriptive error message', () => {
    render(<GlobalError error={testError} retry={mockRetry} />)
    expect(screen.getByText(/please try refreshing the page/i)).toBeInTheDocument()
  })

  it('reports the error to Sentry on mount', () => {
    render(<GlobalError error={testError} retry={mockRetry} />)
    expect(mockCaptureException).toHaveBeenCalledOnce()
    expect(mockCaptureException).toHaveBeenCalledWith(testError)
  })

  it('reports a new error to Sentry when the error prop changes', () => {
    const secondError = new Error('Another global failure')
    const { rerender } = render(<GlobalError error={testError} retry={mockRetry} />)

    rerender(<GlobalError error={secondError} retry={mockRetry} />)

    expect(mockCaptureException).toHaveBeenCalledTimes(2)
    expect(mockCaptureException).toHaveBeenLastCalledWith(secondError)
  })

  it('refetches when the Try again button is clicked', async () => {
    const user = userEvent.setup()
    render(<GlobalError error={testError} retry={mockRetry} />)

    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(mockRetry).toHaveBeenCalledOnce()
  })

  it('works with an error that carries a digest', () => {
    const digestError = Object.assign(new Error('Global digest error'), { digest: 'xyz789' })
    render(<GlobalError error={digestError} retry={mockRetry} />)
    expect(mockCaptureException).toHaveBeenCalledWith(digestError)
  })
})
