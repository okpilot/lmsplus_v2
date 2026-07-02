import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const { mockRouterPush, mockDiscardOralExam } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockDiscardOralExam: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../../actions/discard-oral-exam', () => ({
  discardOralExam: (...args: unknown[]) => mockDiscardOralExam(...args),
}))

// ---- Subject under test -------------------------------------------------------

import { DiscardAndRestartButton } from './discard-and-restart-button'

// ---- Setup ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Tests ------------------------------------------------------------------

describe('DiscardAndRestartButton', () => {
  it('discards the stuck session and returns to the entry page on success', async () => {
    mockDiscardOralExam.mockResolvedValue({ success: true })
    render(<DiscardAndRestartButton sessionId="sess-failed-1" />)

    await userEvent.click(screen.getByRole('button', { name: /start over/i }))

    await waitFor(() =>
      expect(mockDiscardOralExam).toHaveBeenCalledWith({ sessionId: 'sess-failed-1' }),
    )
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/elp'))
  })

  it('shows the error and does not navigate when discarding fails', async () => {
    mockDiscardOralExam.mockResolvedValue({
      success: false,
      error: 'Oral exam session not found.',
    })
    render(<DiscardAndRestartButton sessionId="sess-failed-1" />)

    await userEvent.click(screen.getByRole('button', { name: /start over/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Oral exam session not found.'),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('shows a generic error and does not navigate when discarding throws', async () => {
    mockDiscardOralExam.mockRejectedValue(new Error('network failure'))
    render(<DiscardAndRestartButton sessionId="sess-failed-1" />)

    await userEvent.click(screen.getByRole('button', { name: /start over/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('discards the session once when clicked twice before the first response settles', async () => {
    let resolveDiscard!: (v: { success: true }) => void
    mockDiscardOralExam.mockReturnValue(
      new Promise<{ success: true }>((res) => {
        resolveDiscard = res
      }),
    )
    render(<DiscardAndRestartButton sessionId="sess-failed-1" />)

    const button = screen.getByRole('button', { name: /start over/i })
    await userEvent.click(button)
    await userEvent.click(button)

    expect(mockDiscardOralExam).toHaveBeenCalledTimes(1)

    resolveDiscard({ success: true })
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/elp'))
  })

  it('allows a retry after a failed discard attempt', async () => {
    mockDiscardOralExam
      .mockResolvedValueOnce({ success: false, error: 'Failed to discard oral exam.' })
      .mockResolvedValueOnce({ success: true })
    render(<DiscardAndRestartButton sessionId="sess-failed-1" />)

    const button = screen.getByRole('button', { name: /start over/i })
    await userEvent.click(button)
    await waitFor(() => expect(mockDiscardOralExam).toHaveBeenCalledTimes(1))

    await userEvent.click(button)
    await waitFor(() => expect(mockDiscardOralExam).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/elp'))
  })
})
