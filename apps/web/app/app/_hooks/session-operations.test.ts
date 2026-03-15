import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerResult, CompleteResult, SubmitInput } from '../_types/session'
import { executeComplete, executeSubmit } from './session-operations'

const SUBMIT_INPUT: SubmitInput = {
  sessionId: 'session-1',
  questionId: 'question-1',
  selectedOptionId: 'option-1',
  responseTimeMs: 1200,
}

const SUCCESS_ANSWER_RESULT: AnswerResult = {
  success: true,
  isCorrect: true,
  correctOptionId: 'option-1',
  explanationText: 'Correct answer explanation.',
  explanationImageUrl: null,
}

const SUCCESS_COMPLETE_RESULT: CompleteResult = {
  success: true,
  totalQuestions: 10,
  correctCount: 8,
  scorePercentage: 80,
}

describe('executeSubmit', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('returns the answer result when onSubmitAnswer resolves successfully', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockResolvedValue(SUCCESS_ANSWER_RESULT)

    const result = await executeSubmit(onSubmitAnswer, SUBMIT_INPUT)

    expect(result).toEqual(SUCCESS_ANSWER_RESULT)
  })

  it('passes the full input to onSubmitAnswer unchanged', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockResolvedValue(SUCCESS_ANSWER_RESULT)

    await executeSubmit(onSubmitAnswer, SUBMIT_INPUT)

    expect(onSubmitAnswer).toHaveBeenCalledWith(SUBMIT_INPUT)
  })

  it('returns a failure result when onSubmitAnswer rejects', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockRejectedValue(new Error('network error'))

    const result = await executeSubmit(onSubmitAnswer, SUBMIT_INPUT)

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
  })

  it('does not rethrow when onSubmitAnswer rejects', async () => {
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockRejectedValue(new Error('boom'))

    await expect(executeSubmit(onSubmitAnswer, SUBMIT_INPUT)).resolves.not.toThrow()
  })

  it('logs the error to console.error when onSubmitAnswer rejects', async () => {
    const error = new Error('submit error')
    const onSubmitAnswer = vi
      .fn<(input: SubmitInput) => Promise<AnswerResult>>()
      .mockRejectedValue(error)

    await executeSubmit(onSubmitAnswer, SUBMIT_INPUT)

    expect(console.error).toHaveBeenCalledWith('Failed to submit answer:', error)
  })
})

describe('executeComplete', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('returns the complete result when onComplete resolves successfully', async () => {
    const onComplete = vi
      .fn<(input: { sessionId: string }) => Promise<CompleteResult>>()
      .mockResolvedValue(SUCCESS_COMPLETE_RESULT)

    const result = await executeComplete(onComplete, 'session-1')

    expect(result).toEqual(SUCCESS_COMPLETE_RESULT)
  })

  it('passes sessionId wrapped in an object to onComplete', async () => {
    const onComplete = vi
      .fn<(input: { sessionId: string }) => Promise<CompleteResult>>()
      .mockResolvedValue(SUCCESS_COMPLETE_RESULT)

    await executeComplete(onComplete, 'session-abc')

    expect(onComplete).toHaveBeenCalledWith({ sessionId: 'session-abc' })
  })

  it('returns a failure result when onComplete rejects', async () => {
    const onComplete = vi
      .fn<(input: { sessionId: string }) => Promise<CompleteResult>>()
      .mockRejectedValue(new Error('db timeout'))

    const result = await executeComplete(onComplete, 'session-1')

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
  })

  it('does not rethrow when onComplete rejects', async () => {
    const onComplete = vi
      .fn<(input: { sessionId: string }) => Promise<CompleteResult>>()
      .mockRejectedValue(new Error('boom'))

    await expect(executeComplete(onComplete, 'session-1')).resolves.not.toThrow()
  })

  it('logs the error to console.error when onComplete rejects', async () => {
    const error = new Error('complete error')
    const onComplete = vi
      .fn<(input: { sessionId: string }) => Promise<CompleteResult>>()
      .mockRejectedValue(error)

    await executeComplete(onComplete, 'session-1')

    expect(console.error).toHaveBeenCalledWith('Failed to complete session:', error)
  })
})
