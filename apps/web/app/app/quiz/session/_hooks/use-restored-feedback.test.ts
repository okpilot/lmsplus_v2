import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerFeedback, DraftAnswer } from '../../types'

const { mockRecheck } = vi.hoisted(() => ({ mockRecheck: vi.fn() }))

vi.mock('../_utils/recheck-answer', () => ({
  recheckAnswer: (...a: unknown[]) => mockRecheck(...a),
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

type Props = Parameters<typeof useRestoredFeedback>[0]

function props(over: Partial<Props> = {}): Props {
  return {
    enabled: true,
    sessionId: SESSION,
    questionId: Q1,
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
  mockRecheck.mockResolvedValue(FEEDBACK)
})

describe('useRestoredFeedback', () => {
  it('re-checks the question on screen and returns its feedback', async () => {
    const { result } = renderHook((p: Props) => useRestoredFeedback(p), {
      initialProps: props(),
    })
    await settle()

    expect(mockRecheck).toHaveBeenCalledWith({
      sessionId: SESSION,
      questionId: Q1,
      answer: ANSWER,
    })
    expect(result.current.get(Q1)).toEqual(FEEDBACK)
  })

  it('re-checks each question once however often it is shown', async () => {
    const { rerender } = renderHook((p: Props) => useRestoredFeedback(p), {
      initialProps: props(),
    })
    await settle()
    rerender(props({ questionId: Q2 }))
    await settle()
    rerender(props({ questionId: Q1 }))
    await settle()
    rerender(props({ questionId: Q2 }))
    await settle()

    expect(mockRecheck).toHaveBeenCalledTimes(2)
  })

  it('does not re-check a question that already has feedback', async () => {
    renderHook(() => useRestoredFeedback(props({ feedback: new Map([[Q1, FEEDBACK]]) })))
    await settle()

    expect(mockRecheck).not.toHaveBeenCalled()
  })

  it('does not re-check an answer given in this tab', async () => {
    renderHook(() => useRestoredFeedback(props({ restorable: {} })))
    await settle()

    expect(mockRecheck).not.toHaveBeenCalled()
  })

  it('does not re-check an unanswered question', async () => {
    renderHook(() => useRestoredFeedback(props({ answers: new Map(), restorable: {} })))
    await settle()

    expect(mockRecheck).not.toHaveBeenCalled()
  })

  it('never re-checks when the mode is not a practice mode', async () => {
    const { result } = renderHook(() => useRestoredFeedback(props({ enabled: false })))
    await settle()

    expect(mockRecheck).not.toHaveBeenCalled()
    expect(result.current.size).toBe(0)
  })

  it('leaves the question answered without feedback when the re-check fails, and does not retry', async () => {
    mockRecheck.mockResolvedValue(null)
    const { result, rerender } = renderHook((p: Props) => useRestoredFeedback(p), {
      initialProps: props(),
    })
    await settle()
    rerender(props())
    await settle()

    expect(result.current.has(Q1)).toBe(false)
    expect(mockRecheck).toHaveBeenCalledTimes(1)
  })

  it('treats a rejected re-check like a failed one', async () => {
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
  })
})
