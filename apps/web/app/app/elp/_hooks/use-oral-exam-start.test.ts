import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const { mockRouterPush, mockStartOralExam } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartOralExam: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../actions/start-oral-exam', () => ({
  startOralExam: (...args: unknown[]) => mockStartOralExam(...args),
}))

// ---- Subject under test -------------------------------------------------------

import { useOralExamStart } from './use-oral-exam-start'

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Tests ----------------------------------------------------------------------

describe('useOralExamStart — success path', () => {
  it('navigates to the new practice session after a successful start', async () => {
    mockStartOralExam.mockResolvedValue({ success: true, sessionId: 'sess-practice-1' })
    const { result } = renderHook(() => useOralExamStart())

    await act(async () => {
      result.current.start('practice')
    })

    await waitFor(() => expect(mockStartOralExam).toHaveBeenCalledWith('practice'))
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/app/elp/session/sess-practice-1'),
    )
    expect(result.current.error).toBeNull()
  })

  it('navigates to the new mock-exam session after a successful start', async () => {
    mockStartOralExam.mockResolvedValue({ success: true, sessionId: 'sess-mock-1' })
    const { result } = renderHook(() => useOralExamStart())

    await act(async () => {
      result.current.start('mock')
    })

    await waitFor(() => expect(mockStartOralExam).toHaveBeenCalledWith('mock'))
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/elp/session/sess-mock-1'))
    expect(result.current.error).toBeNull()
  })
})

describe('useOralExamStart — failure path', () => {
  it('surfaces the returned error, does not navigate, and allows a retry', async () => {
    mockStartOralExam
      .mockResolvedValueOnce({
        success: false,
        error: 'You already have an oral exam in progress.',
      })
      .mockResolvedValueOnce({ success: true, sessionId: 'sess-retry-1' })
    const { result } = renderHook(() => useOralExamStart())

    await act(async () => {
      result.current.start('practice')
    })

    await waitFor(() =>
      expect(result.current.error).toBe('You already have an oral exam in progress.'),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()

    // The guard reset on failure allows another attempt; a success then navigates.
    await act(async () => {
      result.current.start('practice')
    })
    await waitFor(() => expect(mockStartOralExam).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/app/elp/session/sess-retry-1'),
    )
  })

  it('surfaces a generic error, does not navigate, and allows a retry when the action throws', async () => {
    mockStartOralExam
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce({ success: true, sessionId: 'sess-retry-2' })
    const { result } = renderHook(() => useOralExamStart())

    await act(async () => {
      result.current.start('practice')
    })

    await waitFor(() =>
      expect(result.current.error).toBe('Something went wrong. Please try again.'),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()

    await act(async () => {
      result.current.start('practice')
    })
    await waitFor(() => expect(mockStartOralExam).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/app/elp/session/sess-retry-2'),
    )
  })
})

describe('useOralExamStart — re-entry guard', () => {
  it('starts once when called twice before the first response settles', async () => {
    let resolveStart!: (v: { success: true; sessionId: string }) => void
    mockStartOralExam.mockReturnValue(
      new Promise<{ success: true; sessionId: string }>((res) => {
        resolveStart = res
      }),
    )
    const { result } = renderHook(() => useOralExamStart())

    await act(async () => {
      result.current.start('practice')
      result.current.start('mock')
    })

    expect(mockStartOralExam).toHaveBeenCalledTimes(1)
    expect(mockStartOralExam).toHaveBeenCalledWith('practice')

    await act(async () => {
      resolveStart({ success: true, sessionId: 'sess-new-1' })
    })
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/elp/session/sess-new-1'))
  })
})
