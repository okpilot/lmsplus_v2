import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExamAnswerBuffer } from './use-exam-answer-buffer'

// ---- Fixtures -------------------------------------------------------------

const Q1 = '00000000-0000-4000-a000-000000000011'
const Q2 = '00000000-0000-4000-a000-000000000022'

function makeOpts(questionId = Q1, startTime = Date.now()) {
  return {
    getQuestionId: vi.fn(() => questionId),
    getAnswerStartTime: vi.fn(() => startTime),
  }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Initial state --------------------------------------------------------

describe('useExamAnswerBuffer — initial state', () => {
  it('starts with an empty answers map', () => {
    const { result } = renderHook(() => useExamAnswerBuffer(makeOpts()))
    expect(result.current.answers.size).toBe(0)
  })

  it('exposes answersRef that mirrors the answers map', () => {
    const { result } = renderHook(() => useExamAnswerBuffer(makeOpts()))
    expect(result.current.answersRef.current.size).toBe(0)
  })
})

// ---- confirmAnswer — happy path -------------------------------------------

describe('useExamAnswerBuffer — confirmAnswer', () => {
  it('returns true and records the answer on first confirmation', async () => {
    const { result } = renderHook(() => useExamAnswerBuffer(makeOpts(Q1)))
    let returned: boolean | undefined
    await act(async () => {
      returned = await result.current.confirmAnswer('opt-a')
    })
    expect(returned).toBe(true)
    expect(result.current.answers.size).toBe(1)
    expect(result.current.answers.get(Q1)?.selectedOptionId).toBe('opt-a')
  })

  it('stores the elapsed response time in milliseconds', async () => {
    const start = Date.now() - 2000
    const opts = makeOpts(Q1, start)
    const { result } = renderHook(() => useExamAnswerBuffer(opts))
    await act(async () => {
      await result.current.confirmAnswer('opt-a')
    })
    const recorded = result.current.answers.get(Q1)
    expect(recorded?.responseTimeMs).toBeGreaterThanOrEqual(2000)
  })

  it('records answers for different questions independently', async () => {
    let currentQuestion = Q1
    let currentStart = Date.now() - 1000

    const opts = {
      getQuestionId: () => currentQuestion,
      getAnswerStartTime: () => currentStart,
    }

    const { result } = renderHook(() => useExamAnswerBuffer(opts))

    await act(async () => {
      await result.current.confirmAnswer('opt-a')
    })

    // Switch to Q2
    currentQuestion = Q2
    currentStart = Date.now() - 500

    await act(async () => {
      await result.current.confirmAnswer('opt-b')
    })

    expect(result.current.answers.size).toBe(2)
    expect(result.current.answers.get(Q1)?.selectedOptionId).toBe('opt-a')
    expect(result.current.answers.get(Q2)?.selectedOptionId).toBe('opt-b')
  })
})

// ---- Lock semantics -------------------------------------------------------

describe('useExamAnswerBuffer — lock semantics', () => {
  it('returns false and does not overwrite when a question is already answered', async () => {
    const { result } = renderHook(() => useExamAnswerBuffer(makeOpts(Q1)))

    await act(async () => {
      await result.current.confirmAnswer('opt-a')
    })

    let secondReturn: boolean | undefined
    await act(async () => {
      secondReturn = await result.current.confirmAnswer('opt-b')
    })

    expect(secondReturn).toBe(false)
    // Original answer must be preserved
    expect(result.current.answers.get(Q1)?.selectedOptionId).toBe('opt-a')
    expect(result.current.answers.size).toBe(1)
  })

  it('answersRef reflects the locked state immediately after confirmation', async () => {
    const { result } = renderHook(() => useExamAnswerBuffer(makeOpts(Q1)))

    await act(async () => {
      await result.current.confirmAnswer('opt-a')
    })

    // answersRef must have been updated synchronously (before React re-render)
    expect(result.current.answersRef.current.has(Q1)).toBe(true)
    expect(result.current.answersRef.current.get(Q1)?.selectedOptionId).toBe('opt-a')
  })

  it('blocks a second confirmation for the same question even in the same tick', async () => {
    const { result } = renderHook(() => useExamAnswerBuffer(makeOpts(Q1)))

    let firstReturn: boolean | undefined
    let secondReturn: boolean | undefined

    await act(async () => {
      // Fire both without awaiting between them
      const p1 = result.current.confirmAnswer('opt-a')
      const p2 = result.current.confirmAnswer('opt-b')
      ;[firstReturn, secondReturn] = await Promise.all([p1, p2])
    })

    expect(firstReturn).toBe(true)
    expect(secondReturn).toBe(false)
    expect(result.current.answers.size).toBe(1)
  })
})

// ---- answersRef sync -------------------------------------------------------

describe('useExamAnswerBuffer — answersRef stays in sync with answers state', () => {
  it('answersRef and answers map contain the same entries after recording', async () => {
    const { result } = renderHook(() => useExamAnswerBuffer(makeOpts(Q1)))

    await act(async () => {
      await result.current.confirmAnswer('opt-c')
    })

    // Both references must agree
    expect(result.current.answersRef.current.size).toBe(result.current.answers.size)
    expect(result.current.answersRef.current.get(Q1)).toEqual(result.current.answers.get(Q1))
  })
})
