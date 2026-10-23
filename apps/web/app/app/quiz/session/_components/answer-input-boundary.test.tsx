import * as Sentry from '@sentry/nextjs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { AnswerInputBoundary } from './answer-input-boundary'

const state = { shouldThrow: true, error: chunkError() as Error }

function chunkError() {
  return Object.assign(new Error('Failed to load chunk x'), { name: 'ChunkLoadError' })
}

class OuterBoundary extends Component<Readonly<{ children: ReactNode }>, { caught: boolean }> {
  state = { caught: false }
  static getDerivedStateFromError() {
    return { caught: true }
  }
  render() {
    return this.state.caught ? <p>outer caught</p> : this.props.children
  }
}

function Child() {
  if (state.shouldThrow) throw state.error
  return <div data-testid="child">child</div>
}

const originalLocation = window.location
const reload = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, reload },
  })
  state.shouldThrow = true
  state.error = chunkError()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

describe('AnswerInputBoundary', () => {
  it('shows an alert with a Reload page button and keeps siblings rendered when a child throws', () => {
    render(
      <div>
        <p>question prompt</p>
        <AnswerInputBoundary>
          <Child />
        </AnswerInputBoundary>
      </div>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('This answer input could not be loaded.')
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    expect(screen.getByText('question prompt')).toBeInTheDocument()
  })

  it('reloads the page when Reload page is clicked', async () => {
    render(
      <AnswerInputBoundary>
        <Child />
      </AnswerInputBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(reload).toHaveBeenCalledTimes(1)
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

  it('lets a non-chunk render error reach the outer boundary without an alert or Sentry report', () => {
    state.error = new Error('render bug')
    render(
      <OuterBoundary>
        <AnswerInputBoundary>
          <Child />
        </AnswerInputBoundary>
      </OuterBoundary>,
    )
    expect(screen.getByText('outer caught')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('reports a chunk-load failure to Sentry once', () => {
    render(
      <AnswerInputBoundary>
        <Child />
      </AnswerInputBoundary>,
    )
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
})
