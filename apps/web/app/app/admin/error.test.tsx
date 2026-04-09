import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Mocks ------------------------------------------------------------------

const mockCaptureException = vi.hoisted(() => vi.fn())

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

import AdminErrorPage from './error'

// ---- Tests ------------------------------------------------------------------

describe('AdminErrorPage', () => {
  const testError = new Error('Something exploded')

  it('renders the error heading', () => {
    render(<AdminErrorPage error={testError} reset={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Something went wrong')
  })

  it('renders the descriptive admin-area message', () => {
    render(<AdminErrorPage error={testError} reset={vi.fn()} />)
    expect(screen.getByText(/unexpected error occurred in the admin area/i)).toBeInTheDocument()
  })

  it('reports the error to Sentry on mount', () => {
    render(<AdminErrorPage error={testError} reset={vi.fn()} />)
    expect(mockCaptureException).toHaveBeenCalledWith(testError)
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
  })

  it('reports a new error to Sentry when the error prop changes', () => {
    const secondError = new Error('Another failure')
    const { rerender } = render(<AdminErrorPage error={testError} reset={vi.fn()} />)
    rerender(<AdminErrorPage error={secondError} reset={vi.fn()} />)
    expect(mockCaptureException).toHaveBeenCalledTimes(2)
    expect(mockCaptureException).toHaveBeenLastCalledWith(secondError)
  })

  it('calls reset when the "Try again" button is clicked', () => {
    const reset = vi.fn()
    render(<AdminErrorPage error={testError} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('renders a "Back to dashboard" link pointing to /app', () => {
    render(<AdminErrorPage error={testError} reset={vi.fn()} />)
    const link = screen.getByRole('link', { name: /back to dashboard/i })
    expect(link).toHaveAttribute('href', '/app')
  })
})
