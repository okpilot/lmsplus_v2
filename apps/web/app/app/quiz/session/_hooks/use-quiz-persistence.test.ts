import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftAnswer, QuizStateOpts } from '../../types'

const { mockWriteActiveSession, mockBuildActiveSession } = vi.hoisted(() => ({
  mockWriteActiveSession: vi.fn(),
  mockBuildActiveSession: vi.fn().mockReturnValue({ mock: 'session' }),
}))

vi.mock('../_utils/quiz-session-storage', () => ({
  writeActiveSession: (...args: unknown[]) => mockWriteActiveSession(...args),
  buildActiveSession: (...args: unknown[]) => mockBuildActiveSession(...args),
}))

import { useQuizPersistence } from './use-quiz-persistence'

const makeOpts = (userId = 'user-1', mode?: QuizStateOpts['mode']): QuizStateOpts => ({
  userId,
  sessionId: 'session-1',
  questions: [],
  mode,
})

const makeAnswers = (): Map<string, DraftAnswer> => new Map()

describe('useQuizPersistence', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockBuildActiveSession.mockReturnValue({ mock: 'session' })
  })

  it('persists a checkpoint snapshot for the current quiz session', () => {
    const opts = makeOpts()
    const { result } = renderHook(() => useQuizPersistence(opts))
    const answers = makeAnswers()

    result.current.checkpoint(answers, 2)

    expect(mockBuildActiveSession).toHaveBeenCalledWith(opts, answers, 2, undefined)
    expect(mockWriteActiveSession).toHaveBeenCalledWith({ mock: 'session' })
  })

  it('forwards the feedback Map as the fourth argument to buildActiveSession', () => {
    const opts = makeOpts()
    const { result } = renderHook(() => useQuizPersistence(opts))
    const answers = makeAnswers()
    const feedback = new Map([
      [
        'q1',
        {
          isCorrect: true,
          correctOptionId: 'opt-a',
          explanationText: null,
          explanationImageUrl: null,
        },
      ],
    ])

    result.current.checkpoint(answers, 1, feedback)

    expect(mockBuildActiveSession).toHaveBeenCalledWith(opts, answers, 1, feedback)
  })

  it('returns the same checkpoint reference across re-renders when opts do not change', () => {
    const opts = makeOpts()
    const { result, rerender } = renderHook(() => useQuizPersistence(opts))
    const first = result.current.checkpoint

    rerender()

    expect(result.current.checkpoint).toBe(first)
  })

  it('returns a new checkpoint reference when opts change', () => {
    const { result, rerender } = renderHook(
      ({ opts }: { opts: QuizStateOpts }) => useQuizPersistence(opts),
      { initialProps: { opts: makeOpts('user-a') } },
    )
    const first = result.current.checkpoint

    rerender({ opts: makeOpts('user-b') })

    expect(result.current.checkpoint).not.toBe(first)
  })

  it('forwards mode: exam to buildActiveSession when opts.mode is exam', () => {
    const opts = makeOpts('user-1', 'exam')
    const { result } = renderHook(() => useQuizPersistence(opts))

    result.current.checkpoint(makeAnswers(), 0)

    expect(mockBuildActiveSession).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'exam' }),
      expect.anything(),
      0,
      undefined,
    )
  })

  it('forwards mode: study to buildActiveSession when opts.mode is study', () => {
    const opts = makeOpts('user-1', 'study')
    const { result } = renderHook(() => useQuizPersistence(opts))

    result.current.checkpoint(makeAnswers(), 0)

    expect(mockBuildActiveSession).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'study' }),
      expect.anything(),
      0,
      undefined,
    )
  })
})
