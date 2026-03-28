import { render, screen } from '@testing-library/react'
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
  const mockReset = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the error heading', () => {
    render(<GlobalError error={testError} reset={mockReset} />)
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
  })

  it('renders a descriptive error message', () => {
    render(<GlobalError error={testError} reset={mockReset} />)
    expect(screen.getByText(/please try refreshing the page/i)).toBeInTheDocument()
  })

  it('reports the error to Sentry on mount', () => {
    render(<GlobalError error={testError} reset={mockReset} />)
    expect(mockCaptureException).toHaveBeenCalledOnce()
    expect(mockCaptureException).toHaveBeenCalledWith(testError)
  })

  it('reports a new error to Sentry when the error prop changes', () => {
    const secondError = new Error('Another global failure')
    const { rerender } = render(<GlobalError error={testError} reset={mockReset} />)

    rerender(<GlobalError error={secondError} reset={mockReset} />)

    expect(mockCaptureException).toHaveBeenCalledTimes(2)
    expect(mockCaptureException).toHaveBeenLastCalledWith(secondError)
  })

  it('works with an error that carries a digest', () => {
    const digestError = Object.assign(new Error('Global digest error'), { digest: 'xyz789' })
    render(<GlobalError error={digestError} reset={mockReset} />)
    expect(mockCaptureException).toHaveBeenCalledWith(digestError)
  })
})
