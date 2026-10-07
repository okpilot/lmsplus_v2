import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorPage from './error'

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
}))

describe('ErrorPage', () => {
  const testError = new Error('Test render failure')
  const mockRetry = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the error heading', () => {
    render(<ErrorPage error={testError} retry={mockRetry} />)
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
  })

  it('renders a descriptive error message', () => {
    render(<ErrorPage error={testError} retry={mockRetry} />)
    expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument()
  })

  it('renders a Try again button', () => {
    render(<ErrorPage error={testError} retry={mockRetry} />)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('reports the error to Sentry on mount', () => {
    render(<ErrorPage error={testError} retry={mockRetry} />)
    expect(mockCaptureException).toHaveBeenCalledOnce()
    expect(mockCaptureException).toHaveBeenCalledWith(testError)
  })

  it('reports a new error to Sentry when the error prop changes', () => {
    const secondError = new Error('Second failure')
    const { rerender } = render(<ErrorPage error={testError} retry={mockRetry} />)

    rerender(<ErrorPage error={secondError} retry={mockRetry} />)

    expect(mockCaptureException).toHaveBeenCalledTimes(2)
    expect(mockCaptureException).toHaveBeenLastCalledWith(secondError)
  })

  it('calls retry when the Try again button is clicked', async () => {
    const user = userEvent.setup()
    render(<ErrorPage error={testError} retry={mockRetry} />)

    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(mockRetry).toHaveBeenCalledOnce()
  })

  it('works with an error that carries a digest', () => {
    const digestError = Object.assign(new Error('Digest error'), { digest: 'abc123' })
    render(<ErrorPage error={digestError} retry={mockRetry} />)
    expect(mockCaptureException).toHaveBeenCalledWith(digestError)
  })
})
