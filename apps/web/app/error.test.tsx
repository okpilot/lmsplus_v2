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
  const mockReset = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the error heading', () => {
    render(<ErrorPage error={testError} reset={mockReset} />)
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
  })

  it('renders a descriptive error message', () => {
    render(<ErrorPage error={testError} reset={mockReset} />)
    expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument()
  })

  it('renders a Try again button', () => {
    render(<ErrorPage error={testError} reset={mockReset} />)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('reports the error to Sentry on mount', () => {
    render(<ErrorPage error={testError} reset={mockReset} />)
    expect(mockCaptureException).toHaveBeenCalledOnce()
    expect(mockCaptureException).toHaveBeenCalledWith(testError)
  })

  it('reports a new error to Sentry when the error prop changes', () => {
    const secondError = new Error('Second failure')
    const { rerender } = render(<ErrorPage error={testError} reset={mockReset} />)

    rerender(<ErrorPage error={secondError} reset={mockReset} />)

    expect(mockCaptureException).toHaveBeenCalledTimes(2)
    expect(mockCaptureException).toHaveBeenLastCalledWith(secondError)
  })

  it('calls reset when the Try again button is clicked', async () => {
    const user = userEvent.setup()
    render(<ErrorPage error={testError} reset={mockReset} />)

    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(mockReset).toHaveBeenCalledOnce()
  })

  it('works with an error that carries a digest', () => {
    const digestError = Object.assign(new Error('Digest error'), { digest: 'abc123' })
    render(<ErrorPage error={digestError} reset={mockReset} />)
    expect(mockCaptureException).toHaveBeenCalledWith(digestError)
  })
})
