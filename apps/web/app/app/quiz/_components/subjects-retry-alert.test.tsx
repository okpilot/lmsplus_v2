import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRefresh, transitionState } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  transitionState: { pending: false },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useTransition: () => [transitionState.pending, (cb: () => void) => cb()] as const,
  }
})

import { SubjectsRetryAlert } from './subjects-retry-alert'

beforeEach(() => {
  mockRefresh.mockReset()
  transitionState.pending = false
})

describe('SubjectsRetryAlert', () => {
  it('refreshes the route when Try again is clicked', async () => {
    render(<SubjectsRetryAlert />)

    expect(screen.getByRole('alert')).toHaveTextContent('Quiz subjects could not be loaded.')
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Try again' }))

    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('disables Try again while the refresh transition is pending', () => {
    transitionState.pending = true
    render(<SubjectsRetryAlert />)

    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
  })
})
