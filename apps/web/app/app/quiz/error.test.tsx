import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import * as Sentry from '@sentry/nextjs'
import QuizError from './error'

describe('QuizError', () => {
  it('shows the quiz page load failure in the alert', () => {
    render(<QuizError error={new Error('boom')} retry={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('This quiz page could not be loaded.')
  })

  it('reports the error and calls retry once on Try again', () => {
    const error = new Error('boom')
    const retry = vi.fn()

    render(<QuizError error={error} retry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(Sentry.captureException).toHaveBeenCalledWith(error)
    expect(retry).toHaveBeenCalledOnce()
  })

  it('renders Try again as a non-submitting button', () => {
    render(<QuizError error={new Error('boom')} retry={vi.fn()} />)
    expect(screen.getByRole('button', { name: /try again/i })).toHaveAttribute('type', 'button')
  })
})
