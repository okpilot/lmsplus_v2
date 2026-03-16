import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerResult, CompleteResult, SessionQuestion, SubmitInput } from '../_types/session'
import { useSessionState } from './use-session-state'

// ---- Fixtures ---------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'

const TWO_QUESTIONS: SessionQuestion[] = [
  {
    id: Q1_ID,
    question_text: 'Q1',
    question_image_url: null,
    question_number: null,
    explanation_text: null,
    explanation_image_url: null,
    options: [{ id: 'opt-a', text: 'Option A' }],
  },
  {
    id: Q2_ID,
    question_text: 'Q2',
    question_image_url: null,
    question_number: null,
    explanation_text: null,
    explanation_image_url: null,
    options: [{ id: 'opt-b', text: 'Option B' }],
  },
]

const ANSWER_CORRECT: AnswerResult = {
  success: true,
  isCorrect: true,
  correctOptionId: 'opt-a',
  explanationText: null,
  explanationImageUrl: null,
}

const COMPLETE_SUCCESS: CompleteResult = {
  success: true,
  totalQuestions: 2,
  correctCount: 2,
  scorePercentage: 100,
}

// ---- Helpers ----------------------------------------------------------------

function makeProps(
  onSubmitAnswer = vi.fn<(input: SubmitInput) => Promise<AnswerResult>>(),
  onComplete = vi.fn<(input: { sessionId: string }) => Promise<CompleteResult>>(),
) {
  return {
    sessionId: SESSION_ID,
    questions: TWO_QUESTIONS,
    onSubmitAnswer,
    onComplete,
  }
}

// ---- Lifecycle --------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Initial state ----------------------------------------------------------

describe('useSessionState — initial state', () => {
  it('starts in the answering state at index 0', () => {
    const { result } = renderHook(() => useSessionState(makeProps()))
    expect(result.current.state).toBe('answering')
    expect(result.current.currentIndex).toBe(0)
  })
})

// ---- handleSubmit -----------------------------------------------------------

describe('useSessionState — handleSubmit', () => {
  it('shows feedback after a correct answer', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockResolvedValue(ANSWER_CORRECT)

    const { result } = renderHook(() =>
      useSessionState({ ...makeProps(onSubmitAnswer), questions: TWO_QUESTIONS }),
    )

    await act(async () => result.current.handleSubmit('opt-a'))

    expect(result.current.state).toBe('feedback')
    expect(result.current.feedback).not.toBeNull()
    expect(result.current.submitting).toBe(false)
    expect(result.current.answeredCount).toBe(1)
    expect(result.current.correctCount).toBe(1)
  })

  it('sets error and resets submitting when onSubmitAnswer throws', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() =>
      useSessionState({ ...makeProps(onSubmitAnswer), questions: TWO_QUESTIONS }),
    )

    await act(async () => result.current.handleSubmit('opt-a'))

    expect(result.current.error).toBe('Something went wrong. Please try again.')
    expect(result.current.submitting).toBe(false)
    expect(result.current.state).toBe('answering')
  })

  it('sets error and resets submitting when onSubmitAnswer returns failure', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockResolvedValue({ success: false, error: 'Invalid option' })

    const { result } = renderHook(() =>
      useSessionState({ ...makeProps(onSubmitAnswer), questions: TWO_QUESTIONS }),
    )

    await act(async () => result.current.handleSubmit('opt-a'))

    expect(result.current.error).toBe('Invalid option')
    expect(result.current.submitting).toBe(false)
  })

  it('drops a concurrent second submission while first is in-flight', async () => {
    let resolveFirst!: (value: AnswerResult) => void
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockImplementationOnce(
        () =>
          new Promise<AnswerResult>((resolve) => {
            resolveFirst = resolve
          }),
      )

    const { result } = renderHook(() =>
      useSessionState({ ...makeProps(onSubmitAnswer), questions: TWO_QUESTIONS }),
    )

    await act(async () => {
      const p1 = result.current.handleSubmit('opt-a')
      const p2 = result.current.handleSubmit('opt-b')
      resolveFirst(ANSWER_CORRECT)
      await Promise.all([p1, p2])
    })

    expect(onSubmitAnswer).toHaveBeenCalledTimes(1)
    expect(result.current.selectedOption).toBe('opt-a')
  })
})

// ---- handleNext (mid-session) -----------------------------------------------

describe('useSessionState — handleNext advancing to next question', () => {
  it('advances to the next question after viewing feedback', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockResolvedValue(ANSWER_CORRECT)

    const { result } = renderHook(() =>
      useSessionState({ ...makeProps(onSubmitAnswer), questions: TWO_QUESTIONS }),
    )

    await act(async () => result.current.handleSubmit('opt-a'))
    await act(async () => result.current.handleNext())

    expect(result.current.currentIndex).toBe(1)
    expect(result.current.state).toBe('answering')
    expect(result.current.feedback).toBeNull()
    expect(result.current.selectedOption).toBeNull()
  })
})

// ---- handleNext (session completion) ----------------------------------------

describe('useSessionState — handleNext completing the session', () => {
  it('transitions to complete state after the last question', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockResolvedValue(ANSWER_CORRECT)
    const onComplete = vi
      .fn<(input: { sessionId: string }) => Promise<CompleteResult>>()
      .mockResolvedValue(COMPLETE_SUCCESS)

    const { result } = renderHook(() =>
      useSessionState({
        sessionId: SESSION_ID,
        questions: [TWO_QUESTIONS[0]!],
        onSubmitAnswer,
        onComplete,
      }),
    )

    await act(async () => result.current.handleSubmit('opt-a'))
    await act(async () => result.current.handleNext())

    expect(result.current.state).toBe('complete')
    expect(result.current.scorePercentage).toBe(100)
    expect(result.current.submitting).toBe(false)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('does not call onComplete a second time when handleNext is called twice concurrently', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockResolvedValue(ANSWER_CORRECT)

    let resolveComplete!: (value: CompleteResult) => void
    const onComplete = vi
      .fn<(input: { sessionId: string }) => Promise<CompleteResult>>()
      .mockImplementationOnce(
        () =>
          new Promise<CompleteResult>((resolve) => {
            resolveComplete = resolve
          }),
      )

    const { result } = renderHook(() =>
      useSessionState({
        sessionId: SESSION_ID,
        questions: [TWO_QUESTIONS[0]!],
        onSubmitAnswer,
        onComplete,
      }),
    )

    await act(async () => result.current.handleSubmit('opt-a'))

    await act(async () => {
      const p1 = result.current.handleNext()
      const p2 = result.current.handleNext()
      resolveComplete(COMPLETE_SUCCESS)
      await Promise.all([p1, p2])
    })

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('complete')
    expect(result.current.submitting).toBe(false)
  })

  it('sets error and resets submitting when onComplete throws', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockResolvedValue(ANSWER_CORRECT)
    const onComplete = vi
      .fn<(input: { sessionId: string }) => Promise<CompleteResult>>()
      .mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() =>
      useSessionState({
        sessionId: SESSION_ID,
        questions: [TWO_QUESTIONS[0]!],
        onSubmitAnswer,
        onComplete,
      }),
    )

    await act(async () => result.current.handleSubmit('opt-a'))
    await act(async () => result.current.handleNext())

    expect(result.current.error).toBe('Something went wrong. Please try again.')
    expect(result.current.submitting).toBe(false)
    expect(result.current.state).not.toBe('complete')
  })

  it('sets error and resets submitting when onComplete returns failure', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockResolvedValue(ANSWER_CORRECT)
    const onComplete = vi
      .fn<(input: { sessionId: string }) => Promise<CompleteResult>>()
      .mockResolvedValue({ success: false, error: 'Session expired' })

    const { result } = renderHook(() =>
      useSessionState({
        sessionId: SESSION_ID,
        questions: [TWO_QUESTIONS[0]!],
        onSubmitAnswer,
        onComplete,
      }),
    )

    await act(async () => result.current.handleSubmit('opt-a'))
    await act(async () => result.current.handleNext())

    expect(result.current.error).toBe('Session expired')
    expect(result.current.submitting).toBe(false)
    expect(result.current.state).not.toBe('complete')
  })

  it('allows a retry after onComplete fails', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockResolvedValue(ANSWER_CORRECT)
    const onComplete = vi
      .fn<(input: { sessionId: string }) => Promise<CompleteResult>>()
      .mockResolvedValueOnce({ success: false, error: 'Temporary failure' })
      .mockResolvedValueOnce(COMPLETE_SUCCESS)

    const { result } = renderHook(() =>
      useSessionState({
        sessionId: SESSION_ID,
        questions: [TWO_QUESTIONS[0]!],
        onSubmitAnswer,
        onComplete,
      }),
    )

    await act(async () => result.current.handleSubmit('opt-a'))
    await act(async () => result.current.handleNext())

    expect(result.current.state).not.toBe('complete')
    expect(result.current.submitting).toBe(false)

    await act(async () => result.current.handleNext())

    expect(result.current.state).toBe('complete')
    expect(onComplete).toHaveBeenCalledTimes(2)
  })
})
