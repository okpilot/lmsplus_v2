import * as Sentry from '@sentry/nextjs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { AnswerInputBoundary } from './answer-input-boundary'

const state = { shouldThrow: true }

function Child() {
  if (state.shouldThrow) throw new Error('chunk failed')
  return <div data-testid="child">child</div>
}

beforeEach(() => {
  vi.resetAllMocks()
  state.shouldThrow = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('AnswerInputBoundary', () => {
  it('shows an alert with a Retry button and keeps siblings rendered when a child throws', () => {
    render(
      <div>
        <p>question prompt</p>
        <AnswerInputBoundary>
          <Child />
        </AnswerInputBoundary>
      </div>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('This answer input could not be loaded.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByText('question prompt')).toBeInTheDocument()
  })

  it('renders the child again on Retry once it stops throwing', async () => {
    render(
      <AnswerInputBoundary>
        <Child />
      </AnswerInputBoundary>,
    )
    state.shouldThrow = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports the failure to Sentry and logs it', () => {
    render(
      <AnswerInputBoundary>
        <Child />
      </AnswerInputBoundary>,
    )
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error))
    expect(console.error).toHaveBeenCalledWith(
      '[AnswerInputBoundary] answer input failed to load:',
      expect.any(Error),
    )
  })
})
