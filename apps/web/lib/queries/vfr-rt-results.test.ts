import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))

const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-1' } },
})

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { getVfrRtResults } from './vfr-rt-results'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getVfrRtResults', () => {
  const sampleResultsJson = {
    part1_pct: '80.0',
    part2_pct: '75.0',
    part3_pct: '100.0',
    passed_overall: true,
    passed_per_part: { part1: true, part2: true, part3: true },
    correct_count: '22',
    total_questions: '25',
    questions: [
      {
        question_id: 'q-1',
        question_type: 'short_answer' as const,
        question_text: 'What is QNH?',
        answers: [
          {
            blank_index: null,
            selected_option_id: null,
            response_text: 'Nautical Height',
            is_correct: true,
          },
        ],
        key: { canonical_answer: 'Nautical Height', accepted_synonyms: [] },
        explanation_text: 'QNH explanation',
        explanation_image_url: null,
      },
    ],
  }

  it('returns null when no user is authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await getVfrRtResults('sess-1')
    expect(result).toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns null and logs when auth itself errors', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'JWT expired' },
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getVfrRtResults('sess-1')
    expect(result).toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith('[getVfrRtResults] Auth error:', 'JWT expired')
    consoleSpy.mockRestore()
  })

  it('returns null and logs when the results RPC errors', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Session not found, not owned, or not completed' },
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getVfrRtResults('sess-1')
    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getVfrRtResults] Results RPC error:',
      'Session not found, not owned, or not completed',
    )
    consoleSpy.mockRestore()
  })

  it('throws when the results payload questions field is not an array', async () => {
    // Non-array questions = backend corruption — surface loudly (error.tsx + Sentry),
    // not a silent null/redirect that masks the bug.
    mockRpc.mockResolvedValueOnce({
      data: { ...sampleResultsJson, questions: null },
      error: null,
    })
    await expect(getVfrRtResults('sess-1')).rejects.toThrow(/questions field is not an array/)
  })

  it('coerces NUMERIC string pcts to numbers in the summary', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: sampleResultsJson, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    const result = await getVfrRtResults('sess-1')
    expect(result).not.toBeNull()
    expect(result!.summary.part1Pct).toBe(80)
    expect(result!.summary.part2Pct).toBe(75)
    expect(result!.summary.part3Pct).toBe(100)
    expect(result!.summary.correctCount).toBe(22)
    expect(result!.summary.totalQuestions).toBe(25)
    expect(typeof result!.summary.part1Pct).toBe('number')
  })

  it('merges MC options and questionImageUrl from the 105 RPC into rows', async () => {
    const mcResultsJson = {
      ...sampleResultsJson,
      questions: [
        {
          question_id: 'q-mc',
          question_type: 'multiple_choice' as const,
          question_text: 'Which call?',
          answers: [
            {
              blank_index: null,
              selected_option_id: 'opt-a',
              response_text: null,
              is_correct: true,
            },
          ],
          key: { correct_option_id: 'opt-a' },
          explanation_text: '',
          explanation_image_url: null,
        },
      ],
    }
    const mcDisplayQ = {
      id: 'q-mc',
      question_type: 'multiple_choice' as const,
      question_text: 'Which call?',
      question_image_url: 'https://example.com/mc.png',
      subject_code: 'RT',
      topic_code: 'P3_MC',
      difficulty: 'easy',
      question_number: '1',
      options: [
        { id: 'opt-a', text: 'Mayday' },
        { id: 'opt-b', text: 'Pan-Pan' },
      ],
      dialog_template: null,
      blanks_safe: null,
    }
    mockRpc
      .mockResolvedValueOnce({ data: mcResultsJson, error: null })
      .mockResolvedValueOnce({ data: [mcDisplayQ], error: null })
    const result = await getVfrRtResults('sess-1')
    expect(result).not.toBeNull()
    expect(result!.rows[0]!.options).toEqual([
      { id: 'opt-a', text: 'Mayday' },
      { id: 'opt-b', text: 'Pan-Pan' },
    ])
    expect(result!.rows[0]!.questionImageUrl).toBe('https://example.com/mc.png')
  })

  it('still returns rows with null options when the 105 RPC errors', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: sampleResultsJson, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getVfrRtResults('sess-1')
    expect(result).not.toBeNull()
    expect(result!.rows[0]!.options).toBeNull()
    expect(result!.rows[0]!.questionImageUrl).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith('[getVfrRtResults] Questions RPC error:', 'rpc failed')
    consoleSpy.mockRestore()
  })

  it('degrades to null options + logs when the display RPC returns a non-array payload', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: sampleResultsJson, error: null })
      .mockResolvedValueOnce({ data: {}, error: null })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getVfrRtResults('sess-1')
    expect(result).not.toBeNull()
    expect(result!.rows[0]!.options).toBeNull()
    expect(result!.rows[0]!.questionImageUrl).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getVfrRtResults] Questions RPC returned a non-array payload',
    )
    consoleSpy.mockRestore()
  })

  it('sets isCorrect to true only when every answer.is_correct is true', async () => {
    const mixedJson = {
      ...sampleResultsJson,
      questions: [
        {
          question_id: 'q-df',
          question_type: 'dialog_fill' as const,
          question_text: 'Fill in the blanks.',
          answers: [
            { blank_index: 0, selected_option_id: null, response_text: 'A', is_correct: true },
            { blank_index: 1, selected_option_id: null, response_text: 'B', is_correct: false },
          ],
          key: {
            blanks: [
              { index: 0, canonical: 'A', synonyms: [] },
              { index: 1, canonical: 'C', synonyms: [] },
            ],
          },
          explanation_text: '',
          explanation_image_url: null,
        },
      ],
    }
    mockRpc
      .mockResolvedValueOnce({ data: mixedJson, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    const result = await getVfrRtResults('sess-1')
    expect(result).not.toBeNull()
    expect(result!.rows[0]!.isCorrect).toBe(false)
  })

  it('marks an unanswered question (empty answers) as incorrect, not vacuously correct', async () => {
    const unansweredJson = {
      ...sampleResultsJson,
      questions: [
        {
          question_id: 'q-skip',
          question_type: 'short_answer' as const,
          question_text: 'Skipped question.',
          answers: [],
          key: { canonical_answer: 'QNH', accepted_synonyms: [] },
          explanation_text: '',
          explanation_image_url: null,
        },
      ],
    }
    mockRpc
      .mockResolvedValueOnce({ data: unansweredJson, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    const result = await getVfrRtResults('sess-1')
    expect(result).not.toBeNull()
    expect(result!.rows[0]!.isCorrect).toBe(false)
  })
})
