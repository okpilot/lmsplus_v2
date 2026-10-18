import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizStateOpts } from '../../session-types'

const { mockSaveAnswer, mockSavePosition } = vi.hoisted(() => ({
  mockSaveAnswer: vi.fn(),
  mockSavePosition: vi.fn(),
}))

vi.mock('../../actions/quiz-progress', () => ({
  saveQuizAnswer: (...a: unknown[]) => mockSaveAnswer(...a),
  saveQuizPosition: (...a: unknown[]) => mockSavePosition(...a),
}))

import { _resetSessionTakeover, markTakenOver } from '../_utils/session-takeover'
import { useProgressSaves } from './use-progress-saves'

const SESSION = '00000000-0000-4000-a000-000000000001'
const Q = '00000000-0000-4000-a000-000000000011'
const MAPPED = 'This session has already ended.'
const TAKEN = 'This quiz is open in another tab or device — reload this page to continue here.'

function makeOpts(mode: QuizStateOpts['mode'], initialSaveError?: string | null) {
  return {
    userId: 'u',
    sessionId: SESSION,
    questions: [{ id: Q }],
    mode,
    initialSaveError,
  } as unknown as QuizStateOpts
}

function setup(mode: QuizStateOpts['mode'] = 'study') {
  const opts = makeOpts(mode)
  return renderHook(() =>
    useProgressSaves({ opts, currentIndexRef: { current: 0 }, answerStartTime: { current: 0 } }),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  _resetSessionTakeover()
  mockSaveAnswer.mockResolvedValue({ success: true })
  mockSavePosition.mockResolvedValue({ success: true })
})

describe('useProgressSaves', () => {
  it('saves nothing in discovery mode', () => {
    const { result } = setup('discovery')
    act(() => {
      result.current.saveAnswer({ selectedOptionId: 'a' })
    })
    act(() => result.current.savePosition(0, new Set(), false))
    expect(mockSaveAnswer).not.toHaveBeenCalled()
    expect(mockSavePosition).not.toHaveBeenCalled()
  })

  it('surfaces a mapped save failure and clears it after the next successful save', async () => {
    mockSaveAnswer.mockResolvedValueOnce({ success: false, error: MAPPED })
    const { result } = setup()
    await act(async () => result.current.saveAnswer({ selectedOptionId: 'a' }))
    expect(result.current.saveError).toBe(MAPPED)
    await act(async () => result.current.saveAnswer({ selectedOptionId: 'b' }))
    expect(result.current.saveError).toBeNull()
  })

  it('shows no save error when the server reports the session taken over', async () => {
    mockSaveAnswer.mockResolvedValueOnce({ success: false, error: TAKEN })
    const { result } = setup()
    await act(async () => result.current.saveAnswer({ selectedOptionId: 'a' }))
    expect(result.current.saveError).toBeNull()
  })

  it('shows a claim error that lands after the first render', () => {
    const { result, rerender } = renderHook(
      ({ err }: { err: string | null }) =>
        useProgressSaves({
          opts: makeOpts('study', err),
          currentIndexRef: { current: 0 },
          answerStartTime: { current: 0 },
        }),
      { initialProps: { err: null as string | null } },
    )
    expect(result.current.saveError).toBeNull()

    rerender({ err: TAKEN })

    expect(result.current.saveError).toBe(TAKEN)
  })

  it('keeps a late claim error off the screen once the session is taken over', () => {
    const { result, rerender } = renderHook(
      ({ err }: { err: string | null }) =>
        useProgressSaves({
          opts: makeOpts('study', err),
          currentIndexRef: { current: 0 },
          answerStartTime: { current: 0 },
        }),
      { initialProps: { err: null as string | null } },
    )
    markTakenOver(SESSION)

    rerender({ err: TAKEN })

    expect(result.current.saveError).toBeNull()
  })

  it('clears a late claim error after the next successful save', async () => {
    const { result, rerender } = renderHook(
      ({ err }: { err: string | null }) =>
        useProgressSaves({
          opts: makeOpts('study', err),
          currentIndexRef: { current: 0 },
          answerStartTime: { current: 0 },
        }),
      { initialProps: { err: null as string | null } },
    )
    rerender({ err: TAKEN })

    await act(async () => result.current.saveAnswer({ selectedOptionId: 'a' }))

    expect(result.current.saveError).toBeNull()
  })

  it('keeps a late claim error off the screen once a save has succeeded', async () => {
    const { result, rerender } = renderHook(
      ({ err }: { err: string | null }) =>
        useProgressSaves({
          opts: makeOpts('study', err),
          currentIndexRef: { current: 0 },
          answerStartTime: { current: 0 },
        }),
      { initialProps: { err: null as string | null } },
    )
    await act(async () => result.current.saveAnswer({ selectedOptionId: 'a' }))

    rerender({ err: TAKEN })

    expect(result.current.saveError).toBeNull()
  })

  it('shows a later save failure after a suppressed claim error', async () => {
    const { result, rerender } = renderHook(
      ({ err }: { err: string | null }) =>
        useProgressSaves({
          opts: makeOpts('study', err),
          currentIndexRef: { current: 0 },
          answerStartTime: { current: 0 },
        }),
      { initialProps: { err: null as string | null } },
    )
    await act(async () => result.current.saveAnswer({ selectedOptionId: 'a' }))
    rerender({ err: TAKEN })
    mockSaveAnswer.mockResolvedValueOnce({ success: false, error: MAPPED })

    await act(async () => result.current.saveAnswer({ selectedOptionId: 'b' }))

    expect(result.current.saveError).toBe(MAPPED)
  })
})
