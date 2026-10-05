import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPush, mockStartVfrRtExam, mockGetActivePracticeSession } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockStartVfrRtExam: vi.fn(),
  mockGetActivePracticeSession: vi.fn(),
}))

vi.mock('@/app/app/quiz/actions/get-active-practice-session', () => ({
  getActivePracticeSession: (...args: unknown[]) => mockGetActivePracticeSession(...args),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('../../vfr-rt-exam/actions/start', () => ({
  startVfrRtExam: (...args: unknown[]) => mockStartVfrRtExam(...args),
}))

import { useVfrRtExamStart } from './use-vfr-rt-exam-start'

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const OPTS = {
  subjectId: SUBJECT_ID,
  subjects: [{ id: SUBJECT_ID, code: 'RT', name: 'VFR RT', short: 'RT', questionCount: 3 }],
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('useVfrRtExamStart', () => {
  it('navigates to /app/quiz/session/<id>, never calls sessionStorage.setItem, never reads localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
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

    expect(mockPush).toHaveBeenCalledWith('/app/quiz/session/00000000-0000-4000-a000-000000000001')
    expect(setItem).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
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

  it('offers to save the blocking practice quiz when the start is blocked', async () => {
    mockStartVfrRtExam.mockResolvedValue({
      success: false,
      error: 'Another session is active',
      blocked: true,
    })
    mockGetActivePracticeSession.mockResolvedValue({
      success: true,
      session: { sessionId: 'blocker-1', subjectName: 'Air Law' },
    })
    const { result } = renderHook(() => useVfrRtExamStart(OPTS))

    await act(async () => {
      await result.current.handleStart()
    })

    expect(result.current.blocked.offer).toEqual({ sessionId: 'blocker-1', subjectName: 'Air Law' })
  })
})
