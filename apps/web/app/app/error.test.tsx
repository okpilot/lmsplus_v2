import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({ captureException: mockCapture }))

import AppError from './error'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AppError', () => {
  it('reports the error and shows an alert', () => {
    const error = new Error('boom')
    render(<AppError error={error} reset={vi.fn()} />)
    expect(mockCapture).toHaveBeenCalledWith(error)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('retries when Try again is clicked', async () => {
    const reset = vi.fn()
    render(<AppError error={new Error('boom')} reset={reset} />)
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
