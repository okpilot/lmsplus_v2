import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCaptureException = vi.hoisted(() => vi.fn())
vi.mock('@sentry/nextjs', () => ({ captureException: mockCaptureException }))

import SittingError from './error'

beforeEach(() => vi.resetAllMocks())

describe('SittingError', () => {
  const err = new Error('boom')

  it('shows the message and a link back to the sittings tab', () => {
    render(<SittingError error={err} retry={vi.fn()} />)
    expect(screen.getByText('Failed to load this sitting.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sittings' })).toHaveAttribute(
      'href',
      '/app/admin/internal-exams?tab=sittings',
    )
  })

  it('retries on Try again', () => {
    const retry = vi.fn()
    render(<SittingError error={err} retry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('reports the error to Sentry', () => {
    render(<SittingError error={err} retry={vi.fn()} />)
    expect(mockCaptureException).toHaveBeenCalledWith(err)
  })
})
