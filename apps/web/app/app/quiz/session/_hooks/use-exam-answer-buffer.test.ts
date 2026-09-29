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

// ---- initialAnswers hydration -----------------------------------------------

describe('useExamAnswerBuffer — initialAnswers hydration', () => {
  it('hydrates from initialAnswers on mount', () => {
    const opts = {
      ...makeOpts(Q1),
      initialAnswers: { [Q1]: { selectedOptionId: 'opt-a', responseTimeMs: 500 } },
    }
    const { result } = renderHook(() => useExamAnswerBuffer(opts))
    expect(result.current.answers.size).toBe(1)
    expect(result.current.answers.get(Q1)).toEqual({
      selectedOptionId: 'opt-a',
      responseTimeMs: 500,
    })
  })

  it('does not overwrite a hydrated (locked) answer', async () => {
    const opts = {
      ...makeOpts(Q1),
      initialAnswers: { [Q1]: { selectedOptionId: 'opt-a', responseTimeMs: 500 } },
    }
    const { result } = renderHook(() => useExamAnswerBuffer(opts))
    let returned: boolean | undefined
    await act(async () => {
      returned = result.current.confirmAnswer('opt-b')
    })
    expect(returned).toBe(false)
    expect(result.current.answers.get(Q1)?.selectedOptionId).toBe('opt-a')
    expect(result.current.answers.size).toBe(1)
  })

  it('still records a fresh answer for a question not in initialAnswers', async () => {
    const currentQuestion = Q2
    const opts = {
      getQuestionId: () => currentQuestion,
      getAnswerStartTime: vi.fn(() => Date.now() - 100),
      initialAnswers: { [Q1]: { selectedOptionId: 'opt-a', responseTimeMs: 500 } },
    }
    const { result } = renderHook(() => useExamAnswerBuffer(opts))
    let returned: boolean | undefined
    await act(async () => {
      returned = result.current.confirmAnswer('opt-c')
    })
    expect(returned).toBe(true)
    expect(result.current.answers.size).toBe(2)
    expect(result.current.answers.get(Q2)?.selectedOptionId).toBe('opt-c')
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

// ---- recordAnswer — non-MC drafts ------------------------------------------

describe('useExamAnswerBuffer — recordAnswer', () => {
  it.each([
    [{ responseText: 'cleared' }],
    [{ blankAnswers: [{ index: 0, text: 'cleared' }] }],
    [{ order: ['a', 'b'] }],
    [{ mapping: [{ zoneId: 'z1', labelId: 'l1' }] }],
  ])('records a non-MC draft with an elapsed response time', async (draft) => {
    const opts = makeOpts(Q1, Date.now() - 1500)
    const { result } = renderHook(() => useExamAnswerBuffer(opts))
    let returned: boolean | undefined
    await act(async () => {
      returned = result.current.recordAnswer(draft)
    })
    expect(returned).toBe(true)
    expect(result.current.answers.get(Q1)).toMatchObject(draft)
    expect(result.current.answers.get(Q1)?.responseTimeMs).toBeGreaterThanOrEqual(1500)
  })

  it('keeps the first answer when a second is recorded for the same question', async () => {
    const { result } = renderHook(() => useExamAnswerBuffer(makeOpts(Q1)))
    let second: boolean | undefined
    await act(async () => {
      result.current.recordAnswer({ responseText: 'first' })
      second = result.current.recordAnswer({ responseText: 'second' })
    })
    expect(second).toBe(false)
    expect(result.current.answers.get(Q1)?.responseText).toBe('first')
  })

  it('rejects a non-MC draft when an MC answer already locked the question', async () => {
    const { result } = renderHook(() => useExamAnswerBuffer(makeOpts(Q1)))
    let returned: boolean | undefined
    await act(async () => {
      result.current.confirmAnswer('opt-a')
      returned = result.current.recordAnswer({ order: ['a'] })
    })
    expect(returned).toBe(false)
    expect(result.current.answers.get(Q1)?.order).toBeUndefined()
  })
})
