import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const {
  mockSaveDraft,
  mockDiscardQuiz,
  mockClearActiveSession,
  mockClearDeploymentPin,
  mockRouterReplace,
} = vi.hoisted(() => ({
  mockSaveDraft: vi.fn(),
  mockDiscardQuiz: vi.fn(),
  mockClearActiveSession: vi.fn(),
  mockClearDeploymentPin: vi.fn(),
  mockRouterReplace: vi.fn(),
}))

vi.mock('../../actions/draft', () => ({
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
}))

vi.mock('../../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))

vi.mock('../_utils/quiz-session-storage', () => ({
  clearActiveSession: mockClearActiveSession,
}))

vi.mock('../../actions/clear-deployment-pin', () => ({
  clearDeploymentPin: mockClearDeploymentPin,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}))

// ---- Subject under test ---------------------------------------------------

import { useSessionRecovery } from './use-session-recovery'

// ---- Fixtures -------------------------------------------------------------

const RECOVERY: Parameters<typeof useSessionRecovery>[0] = {
  userId: 'user-001',
  sessionId: 'sess-001',
  questionIds: ['q1', 'q2', 'q3'],
  answers: { q1: { selectedOptionId: 'opt-a', responseTimeMs: 1000 } },
  currentIndex: 1,
  subjectName: 'Meteorology',
  subjectCode: 'MET',
  draftId: 'draft-001',
  savedAt: Date.now(),
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockClearDeploymentPin.mockResolvedValue(undefined)
  mockDiscardQuiz.mockResolvedValue({ success: true })
  mockSaveDraft.mockResolvedValue({ success: true })
})

// ---- Initial state --------------------------------------------------------

describe('useSessionRecovery — initial state', () => {
  it('starts with loading false and no error', () => {
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

// ---- handleSave -----------------------------------------------------------

describe('useSessionRecovery — handleSave', () => {
  it('calls saveDraft with all recovery fields', async () => {
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockSaveDraft).toHaveBeenCalledWith({
      draftId: RECOVERY.draftId,
      sessionId: RECOVERY.sessionId,
      questionIds: RECOVERY.questionIds,
      answers: RECOVERY.answers,
      currentIndex: RECOVERY.currentIndex,
      subjectName: RECOVERY.subjectName,
      subjectCode: RECOVERY.subjectCode,
    })
  })

  it('does nothing when recovery is null', async () => {
    const { result } = renderHook(() => useSessionRecovery(null, 'user-001'))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  it('redirects to /app/quiz and clears session on success', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(mockClearActiveSession).toHaveBeenCalledWith('user-001')
    expect(mockRouterReplace).toHaveBeenCalledWith('/app/quiz')
  })

  it('sets an error message when saveDraft returns failure with an error string', async () => {
    mockSaveDraft.mockResolvedValue({ success: false, error: 'Draft limit reached' })
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.error).toBe('Draft limit reached')
    expect(mockRouterReplace).not.toHaveBeenCalled()
  })

  it('sets the fallback error when saveDraft returns failure with no error string', async () => {
    mockSaveDraft.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.error).toBe('Failed to save. Please try again.')
  })

  it('sets a generic error when saveDraft throws', async () => {
    mockSaveDraft.mockRejectedValue(new Error('network failure'))
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.error).toBe('Server unavailable. Please try again later.')
    expect(mockRouterReplace).not.toHaveBeenCalled()
  })

  it('resets loading to false after a save failure', async () => {
    mockSaveDraft.mockResolvedValue({ success: false, error: 'oops' })
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.loading).toBe(false)
  })

  it('resets loading to false after saveDraft throws', async () => {
    mockSaveDraft.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    await act(async () => {
      await result.current.handleSave()
    })

    expect(result.current.loading).toBe(false)
  })
})

// ---- handleDiscard --------------------------------------------------------

describe('useSessionRecovery — handleDiscard', () => {
  it('clears the session and redirects to /app/quiz', () => {
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    act(() => {
      result.current.handleDiscard()
    })

    expect(mockClearActiveSession).toHaveBeenCalledWith('user-001')
    expect(mockRouterReplace).toHaveBeenCalledWith('/app/quiz')
  })

  it('fires discardQuiz with sessionId and draftId in the background', async () => {
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    act(() => {
      result.current.handleDiscard()
    })

    await waitFor(() => expect(mockDiscardQuiz).toHaveBeenCalledTimes(1))
    expect(mockDiscardQuiz).toHaveBeenCalledWith({
      sessionId: 'sess-001',
      draftId: 'draft-001',
    })
  })

  it('does not call discardQuiz when recovery is null', () => {
    const { result } = renderHook(() => useSessionRecovery(null, 'user-001'))

    act(() => {
      result.current.handleDiscard()
    })

    expect(mockDiscardQuiz).not.toHaveBeenCalled()
  })

  it('is idempotent — a second call while loading is a no-op', async () => {
    // Make discardQuiz hang so loading stays true
    let resolve: (v: unknown) => void
    mockDiscardQuiz.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )

    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    act(() => {
      result.current.handleDiscard()
    })

    // loading is now true; second call should be ignored
    act(() => {
      result.current.handleDiscard()
    })

    // Resolve to clean up
    resolve!({ success: true })

    // discardQuiz and clearActiveSession called only once
    await waitFor(() => expect(mockDiscardQuiz).toHaveBeenCalledTimes(1))
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
    expect(mockRouterReplace).toHaveBeenCalledTimes(1)
  })

  it('does not block the UI when discardQuiz rejects', async () => {
    mockDiscardQuiz.mockRejectedValue(new Error('server error'))
    const { result } = renderHook(() => useSessionRecovery(RECOVERY, 'user-001'))

    act(() => {
      result.current.handleDiscard()
    })

    // discardQuiz rejects, but no unhandled rejection propagates
    await waitFor(() => expect(mockDiscardQuiz).toHaveBeenCalledTimes(1))
    // Redirect already happened regardless
    expect(mockRouterReplace).toHaveBeenCalledWith('/app/quiz')
  })
})
