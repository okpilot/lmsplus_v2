import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionProgressBar } from './session-progress-bar'

vi.mock('./session-timer', () => ({ SessionTimer: () => null }))

describe('SessionProgressBar', () => {
  it('reports the share of questions reached', () => {
    render(<SessionProgressBar currentIndex={0} totalQuestions={4} />)
    expect(screen.getByRole('progressbar', { name: 'Quiz progress' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    )
  })

  it('reports zero progress when the session has no questions', () => {
    render(<SessionProgressBar currentIndex={0} totalQuestions={0} />)
    expect(screen.getByRole('progressbar', { name: 'Quiz progress' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
  })
})
