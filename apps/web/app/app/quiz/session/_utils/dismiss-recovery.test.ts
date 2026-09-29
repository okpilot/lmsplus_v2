import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClearIfCurrent } = vi.hoisted(() => ({ mockClearIfCurrent: vi.fn() }))

vi.mock('./quiz-session-storage', () => ({
  clearActiveSessionIfCurrent: (userId: string, sessionId: string) =>
    mockClearIfCurrent(userId, sessionId),
}))

import { dismissRecovery } from './dismiss-recovery'
import type { ActiveSession } from './quiz-session-storage'

function recoveryFor(examMode: ActiveSession['examMode']): ActiveSession {
  return { sessionId: 'sess-1', examMode } as ActiveSession
}

describe('dismissRecovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('clears only the stored session it was shown for and leaves a vfr_rt_exam for the VFR RT page', () => {
    const clearRecovery = vi.fn()
    const replace = vi.fn()
    dismissRecovery({
      userId: 'user-1',
      recovery: recoveryFor('vfr_rt_exam'),
      clearRecovery,
      replace,
    })
    expect(mockClearIfCurrent).toHaveBeenCalledWith('user-1', 'sess-1')
    expect(clearRecovery).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/app/vfr-rt')
  })

  it('stays on the page when the exam mode is discardable', () => {
    const replace = vi.fn()
    dismissRecovery({
      userId: 'user-1',
      recovery: recoveryFor(undefined),
      clearRecovery: vi.fn(),
      replace,
    })
    expect(replace).not.toHaveBeenCalled()
  })

  it('does nothing when there is no recovery', () => {
    const clearRecovery = vi.fn()
    dismissRecovery({ userId: 'user-1', recovery: null, clearRecovery, replace: vi.fn() })
    expect(mockClearIfCurrent).not.toHaveBeenCalled()
    expect(clearRecovery).not.toHaveBeenCalled()
  })
})
