import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc, mockClient } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockClient: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({ createServerSupabaseClient: () => mockClient() }))

import { getRestoredFeedback, getRestoredFeedbackBounded } from './restored-feedback'

const SESSION = '11111111-1111-4111-8111-111111111111'
const MC = {
  question_id: 'q1',
  question_type: 'multiple_choice',
  is_correct: true,
  correct_option_id: 'b',
  explanation_text: null,
  explanation_image_url: null,
}
const SHORT = {
  question_id: 'q2',
  question_type: 'short_answer',
  is_correct: false,
  correct_answer: 'wilco',
  blanks: null,
  explanation_text: 'why',
  explanation_image_url: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockClient.mockResolvedValue({ rpc: mockRpc })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('getRestoredFeedback', () => {
  it('returns the feedback of every answered question keyed by question id', async () => {
    mockRpc.mockResolvedValue({ data: { feedback: [MC, SHORT] }, error: null })

    const result = await getRestoredFeedback(SESSION)

    expect(mockRpc).toHaveBeenCalledWith('get_restored_feedback', { p_session_id: SESSION })
    expect(result).toEqual({
      q1: {
        questionType: 'multiple_choice',
        isCorrect: true,
        correctOptionId: 'b',
        explanationText: null,
        explanationImageUrl: null,
      },
      q2: {
        questionType: 'short_answer',
        isCorrect: false,
        correctAnswer: 'wilco',
        explanationText: 'why',
        explanationImageUrl: null,
      },
    })
  })

  it('returns nothing and logs when the read fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_not_found' } })

    expect(await getRestoredFeedback(SESSION)).toEqual({})
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[getRestoredFeedback]'),
      'session_not_found',
    )
  })

  it.each([
    ['a null payload', null],
    ['a payload without a feedback list', { feedback: 'x' }],
    ['a non-object payload', 'x'],
  ])('returns nothing for %s', async (_label, data) => {
    mockRpc.mockResolvedValue({ data, error: null })

    expect(await getRestoredFeedback(SESSION)).toEqual({})
  })

  it('drops a malformed element and keeps the rest', async () => {
    mockRpc.mockResolvedValue({
      data: { feedback: [{ question_id: 'bad', question_type: 'ordering' }, MC] },
      error: null,
    })

    const result = await getRestoredFeedback(SESSION)

    expect(Object.keys(result)).toEqual(['q1'])
    expect(console.error).toHaveBeenCalledTimes(1)
  })
})

describe('getRestoredFeedbackBounded', () => {
  it('logs and returns nothing when the client cannot be created', async () => {
    mockClient.mockRejectedValue(new Error('no cookies'))

    expect(await getRestoredFeedbackBounded(SESSION)).toEqual({})
    expect(console.error).toHaveBeenCalledWith('[getRestoredFeedback] read failed:', 'no cookies')
  })

  it('logs the timeout and returns nothing when the read hangs', async () => {
    vi.useFakeTimers()
    try {
      mockRpc.mockReturnValue(new Promise(() => undefined))

      const pending = getRestoredFeedbackBounded(SESSION)
      await vi.advanceTimersByTimeAsync(3000)

      expect(await pending).toEqual({})
      expect(console.error).toHaveBeenCalledWith('[getRestoredFeedback] timed out after 3000ms')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not log a timeout when the read returns an empty result in time', async () => {
    mockRpc.mockResolvedValue({ data: { feedback: [] }, error: null })

    expect(await getRestoredFeedbackBounded(SESSION)).toEqual({})
    expect(console.error).not.toHaveBeenCalled()
  })
})
