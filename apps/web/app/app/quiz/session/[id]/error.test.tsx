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

  it('titles the failure with a level-2 heading', () => {
    render(<QuizSessionError error={new Error('boom')} retry={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeVisible()
  })

  it('shows the load failure in an alert empty state', () => {
    render(<QuizSessionError error={new Error('boom')} retry={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveAttribute('data-slot', 'empty-header')
    expect(screen.getByRole('alert')).toHaveTextContent('This quiz could not be loaded.')
  })

  it('renders Try again as a non-submitting button', () => {
    render(<QuizSessionError error={new Error('boom')} retry={vi.fn()} />)
    expect(screen.getByRole('button', { name: /try again/i })).toHaveAttribute('type', 'button')
  })
})
