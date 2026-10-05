import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerFeedback, DraftAnswer } from '../../types'

const { mockRecheck } = vi.hoisted(() => ({ mockRecheck: vi.fn() }))

vi.mock('../_utils/recheck-answers', () => ({
  recheckAnswers: (...a: unknown[]) => mockRecheck(...a),
}))

import { useRestoredFeedback } from './use-restored-feedback'

const SESSION = '00000000-0000-4000-a000-000000000001'
const Q1 = '00000000-0000-4000-a000-000000000011'
const Q2 = '00000000-0000-4000-a000-000000000022'
const ANSWER: DraftAnswer = { selectedOptionId: 'b', responseTimeMs: 900 }
const FEEDBACK: AnswerFeedback = {
  questionType: 'multiple_choice',
  isCorrect: true,
  correctOptionId: 'b',
  explanationText: null,
  explanationImageUrl: null,
}
const WRONG: AnswerFeedback = { ...FEEDBACK, isCorrect: false, correctOptionId: 'c' }

type Props = Parameters<typeof useRestoredFeedback>[0]

function props(over: Partial<Props> = {}): Props {
  return {
    enabled: true,
    sessionId: SESSION,
    restorable: { [Q1]: ANSWER, [Q2]: ANSWER },
    answers: new Map([
      [Q1, ANSWER],
      [Q2, ANSWER],
    ]),
    feedback: new Map(),
    ...over,
  }
}

const settle = () => act(async () => {})

beforeEach(() => {
  vi.resetAllMocks()
  mockRecheck.mockResolvedValue(
    new Map([
      [Q1, FEEDBACK],
      [Q2, WRONG],
    ]),
  )
})

describe('useRestoredFeedback', () => {
  it('gives every restored answer its feedback on mount without any visit', async () => {
    const { result } = renderHook((p: Props) => useRestoredFeedback(p), {
      initialProps: props(),
    })
    await settle()

    expect(result.current.get(Q1)).toEqual(FEEDBACK)
    expect(result.current.get(Q2)).toEqual(WRONG)
  })

  it('grades the restored answers in a single call however often it re-renders', async () => {
    const { rerender } = renderHook((p: Props) => useRestoredFeedback(p), {
      initialProps: props(),
    })
    await settle()
    rerender(props())
    await settle()
    rerender(props({ feedback: new Map([[Q1, FEEDBACK]]) }))
    await settle()

    expect(mockRecheck).toHaveBeenCalledTimes(1)
    expect(mockRecheck).toHaveBeenCalledWith({
      sessionId: SESSION,
      restorable: { [Q1]: ANSWER, [Q2]: ANSWER },
    })
  })

  it('never grades when the mode is not a practice mode', async () => {
    const { result } = renderHook(() => useRestoredFeedback(props({ enabled: false })))
    await settle()

    expect(mockRecheck).not.toHaveBeenCalled()
    expect(result.current.size).toBe(0)
  })

  it('does not grade when nothing was restored', async () => {
    renderHook(() => useRestoredFeedback(props({ restorable: {} })))
    renderHook(() => useRestoredFeedback(props({ restorable: undefined })))
    await settle()

    expect(mockRecheck).not.toHaveBeenCalled()
  })

  it('leaves every answer without feedback when grading fails, and does not retry', async () => {
    mockRecheck.mockResolvedValue(new Map())
    const { result, rerender } = renderHook((p: Props) => useRestoredFeedback(p), {
      initialProps: props(),
    })
    await settle()
    rerender(props())
    await settle()

    expect(result.current.size).toBe(0)
    expect(mockRecheck).toHaveBeenCalledTimes(1)
  })

  it('treats a rejected grading call like a failed one', async () => {
    mockRecheck.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useRestoredFeedback(props()))
    await settle()

    expect(result.current.size).toBe(0)
  })

  it('prefers the feedback of an answer given in this tab over a restored one', async () => {
    const live: AnswerFeedback = { ...FEEDBACK, isCorrect: false }
    const { result, rerender } = renderHook((p: Props) => useRestoredFeedback(p), {
      initialProps: props(),
    })
    await settle()
    rerender(props({ feedback: new Map([[Q1, live]]) }))

    expect(result.current.get(Q1)).toEqual(live)
    expect(result.current.get(Q2)).toEqual(WRONG)
  })
})
