import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPush, mockStartVfrRtExam } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockStartVfrRtExam: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('../../vfr-rt-exam/actions/start', () => ({
  startVfrRtExam: (...args: unknown[]) => mockStartVfrRtExam(...args),
}))

import { useVfrRtExamStart } from './use-vfr-rt-exam-start'

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const OPTS = {
  userId: 'user-1',
  subjectId: SUBJECT_ID,
  subjects: [{ id: SUBJECT_ID, code: 'RT', name: 'VFR RT', short: 'RT', questionCount: 3 }],
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('useVfrRtExamStart', () => {
  it('navigates to the session runner after a successful start', async () => {
    mockStartVfrRtExam.mockResolvedValue({
      success: true,
      sessionId: '00000000-0000-4000-a000-000000000001',
      questionIds: ['q-1'],
      timeLimitSeconds: 1800,
      parts: { p1End: 1, p2End: 1, p3End: 1 },
      startedAt: new Date().toISOString(),
    })
    const { result } = renderHook(() => useVfrRtExamStart(OPTS))

    await act(async () => {
      await result.current.handleStart()
    })

    expect(mockPush).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('exposes the start error and stops loading when the start fails', async () => {
    mockStartVfrRtExam.mockResolvedValue({ success: false, error: 'No exam configured' })
    const { result } = renderHook(() => useVfrRtExamStart(OPTS))

    await act(async () => {
      await result.current.handleStart()
    })

    expect(result.current.error).toBe('No exam configured')
    expect(result.current.loading).toBe(false)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('starts only once when invoked twice in the same tick', async () => {
    mockStartVfrRtExam.mockResolvedValue({ success: false, error: 'x' })
    const { result } = renderHook(() => useVfrRtExamStart(OPTS))

    await act(async () => {
      await Promise.all([result.current.handleStart(), result.current.handleStart()])
    })

    expect(mockStartVfrRtExam).toHaveBeenCalledTimes(1)
  })
})
