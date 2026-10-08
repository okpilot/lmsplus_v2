import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import * as Sentry from '@sentry/nextjs'
import QuizSessionError from './error'

describe('QuizSessionError', () => {
  it('reports the error and lets the student try again', () => {
    const error = new Error('boom')
    const retry = vi.fn()

    render(<QuizSessionError error={error} retry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(Sentry.captureException).toHaveBeenCalledWith(error)
    expect(retry).toHaveBeenCalledOnce()
  })
})
