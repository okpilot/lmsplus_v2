// Uses the real `catchError` from next/error under jsdom.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({ captureException: mockCapture }))

import SubjectsErrorBoundary from './subjects-error-boundary'

let shouldThrow: unknown

function Child() {
  if (shouldThrow !== undefined) throw shouldThrow
  return <p>subjects picker</p>
}

function Page() {
  return (
    <div>
      <p>page header</p>
      <SubjectsErrorBoundary>
        <Child />
      </SubjectsErrorBoundary>
    </div>
  )
}

beforeEach(() => {
  mockCapture.mockReset()
  shouldThrow = undefined
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SubjectsErrorBoundary', () => {
  it('shows the subjects alert and keeps sibling content when the child throws', () => {
    shouldThrow = new Error('boom')
    render(<Page />)
    expect(screen.getByRole('alert')).toHaveTextContent('Quiz subjects could not be loaded.')
    expect(screen.getByText('page header')).toBeVisible()
    expect(screen.queryByText('subjects picker')).toBeNull()
  })

  it('reports the error to Sentry and renders Try again as a non-submitting button that retries', async () => {
    const error = new Error('boom')
    shouldThrow = error
    render(<Page />)
    expect(mockCapture).toHaveBeenCalledWith(error)
    const button = screen.getByRole('button', { name: 'Try again' })
    expect(button).toHaveAttribute('type', 'button')
    shouldThrow = undefined
    await userEvent.setup({ delay: null }).click(button)
    expect(screen.getByText('subjects picker')).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports an Error once across a re-render', () => {
    shouldThrow = new Error('boom')
    const { rerender } = render(<Page />)
    rerender(<Page />)
    expect(mockCapture).toHaveBeenCalledTimes(1)
  })

  it('reports a non-Error thrown value once across a re-render', () => {
    shouldThrow = 'plain string'
    const { rerender } = render(<Page />)
    rerender(<Page />)
    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(mockCapture.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  it('renders children and no alert when the child does not throw', () => {
    render(<Page />)
    expect(screen.getByText('subjects picker')).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
