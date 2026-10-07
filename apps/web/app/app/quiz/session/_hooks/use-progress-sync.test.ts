import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizStateOpts } from '../../session-types'

const { mockSaveAnswer, mockSavePosition } = vi.hoisted(() => ({
  mockSaveAnswer: vi.fn(),
  mockSavePosition: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))
vi.mock('../../actions/quiz-progress', () => ({
  saveQuizAnswer: (...a: unknown[]) => mockSaveAnswer(...a),
  saveQuizPosition: (...a: unknown[]) => mockSavePosition(...a),
}))

import { _resetQuizDeviceId } from '../_utils/quiz-device-id'
import { _resetSessionTakeover } from '../_utils/session-takeover'
import { useProgressSync } from './use-progress-sync'

const SESSION = '00000000-0000-4000-a000-000000000001'
const Q = [
  '00000000-0000-4000-a000-000000000011',
  '00000000-0000-4000-a000-000000000022',
  '00000000-0000-4000-a000-000000000033',
]
const MAPPED = 'This session has already ended.'

function opts(over: Partial<QuizStateOpts> = {}): QuizStateOpts {
  return {
    userId: 'u',
    sessionId: SESSION,
    questions: Q.map((id) => ({ id })) as unknown as QuizStateOpts['questions'],
    mode: 'study',
    ...over,
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  _resetQuizDeviceId()
  _resetSessionTakeover()
  mockSaveAnswer.mockResolvedValue({ success: true })
  mockSavePosition.mockResolvedValue({ success: true })
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useProgressSync — navigation', () => {
  it('saves the new position with the question being left and its visit time', () => {
    const { result } = renderHook(() => useProgressSync(opts()))
    vi.spyOn(Date, 'now').mockReturnValue(1_004_500)
    act(() => result.current.nav.navigateTo(2))
    expect(mockSavePosition).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION,
        currentIndex: 2,
        pinnedQuestionIds: [],
        leaving: { questionId: Q[0], timeSpentMs: 4500 },
      }),
    )
    expect(result.current.nav.currentIndex).toBe(2)
  })

  it('saves relative navigation against the live current index', async () => {
    const { result } = renderHook(() => useProgressSync(opts()))
    act(() => result.current.nav.navigate(1))
    act(() => result.current.nav.navigate(1))
    await act(settle)
    expect(mockSavePosition.mock.calls.map((c) => c[0].currentIndex)).toEqual([1, 2])
    expect(mockSavePosition.mock.calls[1]?.[0].leaving.questionId).toBe(Q[1])
  })

  it('does not save for an out-of-range target and stays put', () => {
    const { result } = renderHook(() => useProgressSync(opts()))
    act(() => result.current.nav.navigate(-1))
    act(() => result.current.nav.navigateTo(3))
    expect(mockSavePosition).not.toHaveBeenCalled()
    expect(result.current.nav.currentIndex).toBe(0)
  })

  it('sends every call with the same tab device id', async () => {
    const { result } = renderHook(() => useProgressSync(opts()))
    act(() => result.current.nav.navigate(1))
    act(() => {
      result.current.saveAnswer({ selectedOptionId: 'a' })
    })
    await act(settle)
    expect(mockSavePosition.mock.calls[0]?.[0].deviceId).toBe(
      mockSaveAnswer.mock.calls[0]?.[0].deviceId,
    )
  })
})

describe('useProgressSync — pins', () => {
  it('saves the toggled pin set at the current index without a leaving question', () => {
    const { result } = renderHook(() => useProgressSync(opts()))
    act(() => result.current.togglePin(Q[0] as string))
    const sent = mockSavePosition.mock.calls[0]?.[0]
    expect(sent).toMatchObject({ currentIndex: 0, pinnedQuestionIds: [Q[0]] })
    expect(sent).not.toHaveProperty('leaving')
    expect(result.current.pinnedQuestions.has(Q[0] as string)).toBe(true)
  })

  it('carries existing pins on the next navigation', async () => {
    const { result } = renderHook(() => useProgressSync(opts()))
    act(() => result.current.togglePin(Q[1] as string))
    act(() => result.current.nav.navigate(1))
    await act(settle)
    expect(mockSavePosition.mock.calls[1]?.[0].pinnedQuestionIds).toEqual([Q[1]])
  })
})

describe('useProgressSync — answers', () => {
  it('saves the answer for the current question with its elapsed time', () => {
    const { result } = renderHook(() => useProgressSync(opts({ mode: 'exam' })))
    vi.spyOn(Date, 'now').mockReturnValue(1_002_000)
    act(() => {
      result.current.saveAnswer({ selectedOptionId: 'b' })
    })
    expect(mockSaveAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: Q[0],
        answer: { selectedOptionId: 'b' },
        timeSpentMs: 2000,
      }),
    )
  })
})

describe('useProgressSync — discovery', () => {
  it('saves nothing for navigation, pins or answers', () => {
    const { result } = renderHook(() => useProgressSync(opts({ mode: 'discovery' })))
    act(() => result.current.nav.navigate(1))
    act(() => result.current.togglePin(Q[0] as string))
    act(() => {
      result.current.saveAnswer({ selectedOptionId: 'a' })
    })
    expect(mockSavePosition).not.toHaveBeenCalled()
    expect(mockSaveAnswer).not.toHaveBeenCalled()
    expect(result.current.nav.currentIndex).toBe(1)
  })
})

describe('useProgressSync — save error', () => {
  it('starts with the claim error and clears it after a successful save', async () => {
    const { result } = renderHook(() => useProgressSync(opts({ initialSaveError: MAPPED })))
    expect(result.current.saveError).toBe(MAPPED)
    act(() => result.current.nav.navigate(1))
    await act(settle)
    expect(result.current.saveError).toBeNull()
  })

  it('shows mapped failure copy and keeps it until a save succeeds', async () => {
    mockSavePosition.mockResolvedValueOnce({ success: false, error: MAPPED })
    const { result } = renderHook(() => useProgressSync(opts()))
    act(() => result.current.nav.navigate(1))
    await act(settle)
    expect(result.current.saveError).toBe(MAPPED)
  })

  it('ignores an unmapped failure and still navigates', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSavePosition.mockResolvedValue({ success: false, error: 'Could not save progress' })
    const { result } = renderHook(() => useProgressSync(opts()))
    act(() => result.current.nav.navigate(1))
    await act(settle)
    expect(result.current.saveError).toBeNull()
    expect(result.current.nav.currentIndex).toBe(1)
  })
})

describe('useProgressSync — seeded pins', () => {
  it('shows the pins the server saved and keeps them in the next position save', () => {
    const { result } = renderHook(() =>
      useProgressSync(opts({ initialPinnedIds: [Q[1] as string] })),
    )
    expect([...result.current.pinnedQuestions]).toEqual([Q[1]])
    act(() => result.current.nav.navigateTo(2))
    expect(mockSavePosition).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedQuestionIds: [Q[1]] }),
    )
  })
})
