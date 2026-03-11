import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StartReviewButton } from './start-review-button'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockStartReviewSession = vi.fn()
vi.mock('../actions', () => ({
  startReviewSession: (...args: unknown[]) => mockStartReviewSession(...args),
}))

describe('StartReviewButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock sessionStorage
    vi.stubGlobal('sessionStorage', { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() })
  })

  it('renders the button with correct text', () => {
    render(<StartReviewButton disabled={false} />)
    expect(screen.getByRole('button', { name: 'Start Smart Review' })).toBeInTheDocument()
  })

  it('disables the button when disabled prop is true', () => {
    render(<StartReviewButton disabled={true} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('navigates to session page on success', async () => {
    const user = userEvent.setup()
    mockStartReviewSession.mockResolvedValue({
      success: true,
      sessionId: 'sess-1',
      questionIds: ['q1', 'q2'],
    })

    render(<StartReviewButton disabled={false} />)
    await user.click(screen.getByRole('button'))

    expect(mockStartReviewSession).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/app/review/session')
  })

  it('stores session data in sessionStorage on success', async () => {
    const user = userEvent.setup()
    mockStartReviewSession.mockResolvedValue({
      success: true,
      sessionId: 'sess-1',
      questionIds: ['q1'],
    })

    render(<StartReviewButton disabled={false} />)
    await user.click(screen.getByRole('button'))

    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      'review-session',
      JSON.stringify({ sessionId: 'sess-1', questionIds: ['q1'] }),
    )
  })

  it('does not navigate on failure', async () => {
    const user = userEvent.setup()
    mockStartReviewSession.mockResolvedValue({ success: false, error: 'No cards due' })

    render(<StartReviewButton disabled={false} />)
    await user.click(screen.getByRole('button'))

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows loading text while starting', async () => {
    let resolvePromise: (v: unknown) => void
    mockStartReviewSession.mockReturnValue(
      new Promise((r) => {
        resolvePromise = r
      }),
    )

    const user = userEvent.setup()
    render(<StartReviewButton disabled={false} />)
    await user.click(screen.getByRole('button'))

    expect(screen.getByText('Starting...')).toBeInTheDocument()
    // resolvePromise is assigned synchronously before this line runs
    resolvePromise?.({ success: false, error: 'fail' })
  })
})
