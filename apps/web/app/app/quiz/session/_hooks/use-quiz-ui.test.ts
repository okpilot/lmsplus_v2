import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerFeedback } from '../../types'
import { useQuizUI } from './use-quiz-ui'

// ---- Fixtures ---------------------------------------------------------------

const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'
const OPT_A = 'opt-a'

function makeFeedback(overrides?: Partial<AnswerFeedback>): AnswerFeedback {
  return {
    isCorrect: true,
    correctOptionId: OPT_A,
    explanationText: null,
    explanationImageUrl: null,
    ...overrides,
  }
}

function renderUI(
  opts: Partial<Parameters<typeof useQuizUI>[0]> & {
    feedback?: Map<string, AnswerFeedback>
  } = {},
) {
  const defaults = {
    feedback: new Map<string, AnswerFeedback>(),
    currentIndex: 0,
    activeTab: 'question',
    existingAnswer: undefined,
  }
  return renderHook((props: Parameters<typeof useQuizUI>[0]) => useQuizUI(props), {
    initialProps: { ...defaults, ...opts } as Parameters<typeof useQuizUI>[0],
  })
}

// ---- Lifecycle ---------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- feedbackMap (memo) ------------------------------------------------------

describe('useQuizUI — feedbackMap', () => {
  it('returns an empty map when no feedback entries are present', () => {
    const { result } = renderUI()
    expect(result.current.feedbackMap.size).toBe(0)
  })

  it('projects each feedback entry to { isCorrect } only', () => {
    const feedback = new Map([[Q1_ID, makeFeedback({ isCorrect: true })]])
    const { result } = renderUI({ feedback })

    const entry = result.current.feedbackMap.get(Q1_ID)
    expect(entry).toEqual({ isCorrect: true })
    // correctOptionId and explanationText must NOT be exposed
    expect(entry).not.toHaveProperty('correctOptionId')
    expect(entry).not.toHaveProperty('explanationText')
  })

  it('returns false for isCorrect when the feedback records an incorrect answer', () => {
    const feedback = new Map([[Q1_ID, makeFeedback({ isCorrect: false })]])
    const { result } = renderUI({ feedback })

    expect(result.current.feedbackMap.get(Q1_ID)?.isCorrect).toBe(false)
  })

  it('projects multiple feedback entries independently', () => {
    const feedback = new Map([
      [Q1_ID, makeFeedback({ isCorrect: true })],
      [Q2_ID, makeFeedback({ isCorrect: false })],
    ])
    const { result } = renderUI({ feedback })

    expect(result.current.feedbackMap.get(Q1_ID)?.isCorrect).toBe(true)
    expect(result.current.feedbackMap.get(Q2_ID)?.isCorrect).toBe(false)
  })
})

// ---- pendingOptionId / handleSelectionChange --------------------------------

describe('useQuizUI — pendingOptionId and handleSelectionChange', () => {
  it('starts with pendingOptionId as null', () => {
    const { result } = renderUI()
    expect(result.current.pendingOptionId).toBeNull()
  })

  it('updates pendingOptionId when handleSelectionChange is called with an id', () => {
    const { result } = renderUI()

    act(() => {
      result.current.handleSelectionChange(OPT_A)
    })

    expect(result.current.pendingOptionId).toBe(OPT_A)
  })

  it('clears pendingOptionId when handleSelectionChange is called with null', () => {
    const { result } = renderUI()

    act(() => {
      result.current.handleSelectionChange(OPT_A)
    })
    act(() => {
      result.current.handleSelectionChange(null)
    })

    expect(result.current.pendingOptionId).toBeNull()
  })

  it('resets pendingOptionId to null when currentIndex changes', () => {
    const { result, rerender } = renderUI({ currentIndex: 0 })

    act(() => {
      result.current.handleSelectionChange(OPT_A)
    })
    expect(result.current.pendingOptionId).toBe(OPT_A)

    rerender({
      feedback: new Map(),
      currentIndex: 1,
      activeTab: 'question',
      existingAnswer: undefined,
    })

    expect(result.current.pendingOptionId).toBeNull()
  })

  it('does not reset pendingOptionId when a prop other than currentIndex changes', () => {
    const { result, rerender } = renderUI({ currentIndex: 0, activeTab: 'question' })

    act(() => {
      result.current.handleSelectionChange(OPT_A)
    })

    rerender({
      feedback: new Map(),
      currentIndex: 0,
      activeTab: 'explanation', // tab changed, index did not
      existingAnswer: undefined,
    })

    expect(result.current.pendingOptionId).toBe(OPT_A)
  })
})

// ---- canSubmitAnswer --------------------------------------------------------

describe('useQuizUI — canSubmitAnswer', () => {
  it('is false when no option is selected', () => {
    const { result } = renderUI({ activeTab: 'question', existingAnswer: undefined })
    expect(result.current.canSubmitAnswer).toBe(false)
  })

  it('is true when on the question tab, no existing answer, and an option is selected', () => {
    const { result } = renderUI({ activeTab: 'question', existingAnswer: undefined })

    act(() => {
      result.current.handleSelectionChange(OPT_A)
    })

    expect(result.current.canSubmitAnswer).toBe(true)
  })

  it('is false when activeTab is not "question" even if an option is selected', () => {
    const { result } = renderUI({ activeTab: 'explanation', existingAnswer: undefined })

    act(() => {
      result.current.handleSelectionChange(OPT_A)
    })

    expect(result.current.canSubmitAnswer).toBe(false)
  })

  it('is false when an existing answer is present even if an option is selected', () => {
    const { result } = renderUI({
      activeTab: 'question',
      existingAnswer: { selectedOptionId: OPT_A, responseTimeMs: 500 },
    })

    act(() => {
      result.current.handleSelectionChange(OPT_A)
    })

    expect(result.current.canSubmitAnswer).toBe(false)
  })

  it('becomes false after navigating to a new question (pendingOptionId resets)', () => {
    const { result, rerender } = renderUI({
      currentIndex: 0,
      activeTab: 'question',
      existingAnswer: undefined,
    })

    act(() => {
      result.current.handleSelectionChange(OPT_A)
    })
    expect(result.current.canSubmitAnswer).toBe(true)

    rerender({
      feedback: new Map(),
      currentIndex: 1,
      activeTab: 'question',
      existingAnswer: undefined,
    })

    expect(result.current.canSubmitAnswer).toBe(false)
  })
})
