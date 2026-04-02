import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// ---- Subject under test ---------------------------------------------------

import { loadDrafts } from './load-draft'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const DRAFT_ID = 'draft-00000000-0000-4000-a000-000000000001'

function buildDraftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    student_id: USER_ID,
    session_config: { sessionId: 'sess-abc', subjectName: 'Meteorology', subjectCode: 'MET' },
    question_ids: ['q1', 'q2'],
    answers: { q1: { selectedOptionId: 'a', responseTimeMs: 4000 } },
    current_index: 1,
    created_at: '2026-03-12T10:00:00Z',
    updated_at: '2026-03-12T10:05:00Z',
    ...overrides,
  }
}

function buildSelectChain(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  }
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('loadDrafts', () => {
  it('returns empty drafts when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const result = await loadDrafts()

    expect(result).toEqual({ drafts: [] })
  })

  it('returns empty drafts when authentication fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })

    const result = await loadDrafts()

    expect(result).toEqual({ drafts: [] })
  })

  it('returns empty drafts when the DB query returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(
      buildSelectChain({ data: null, error: { message: 'DB connection error' } }),
    )

    const result = await loadDrafts()

    expect(result).toEqual({ drafts: [] })
  })

  it('returns empty drafts when the DB returns no rows', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(buildSelectChain({ data: [], error: null }))

    const result = await loadDrafts()

    expect(result).toEqual({ drafts: [] })
  })

  it('maps a valid draft row to DraftData with all fields', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(buildSelectChain({ data: [buildDraftRow()], error: null }))

    const result = await loadDrafts()

    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0]).toEqual({
      id: DRAFT_ID,
      sessionId: 'sess-abc',
      questionIds: ['q1', 'q2'],
      answers: { q1: { selectedOptionId: 'a', responseTimeMs: 4000 } },
      currentIndex: 1,
      subjectName: 'Meteorology',
      subjectCode: 'MET',
      createdAt: '2026-03-12T10:00:00Z',
    })
  })

  it('maps feedback column to DraftData.feedback when present', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const feedbackData = {
      q1: {
        isCorrect: true,
        correctOptionId: 'opt-a',
        explanationText: 'Pressure altitude ignores temperature.',
        explanationImageUrl: null,
      },
    }
    mockFrom.mockReturnValue(
      buildSelectChain({ data: [buildDraftRow({ feedback: feedbackData })], error: null }),
    )

    const result = await loadDrafts()

    expect(result.drafts[0]!.feedback).toEqual(feedbackData)
  })

  it('returns feedback as undefined when the feedback column is null', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(
      buildSelectChain({ data: [buildDraftRow({ feedback: null })], error: null }),
    )

    const result = await loadDrafts()

    expect(result.drafts[0]!.feedback).toBeUndefined()
  })

  it('returns feedback as undefined when the feedback column is absent from the row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // buildDraftRow does not include feedback by default
    mockFrom.mockReturnValue(buildSelectChain({ data: [buildDraftRow()], error: null }))

    const result = await loadDrafts()

    expect(result.drafts[0]!.feedback).toBeUndefined()
  })

  it('includes feedback even when session_config is malformed', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const feedbackData = {
      q1: {
        isCorrect: false,
        correctOptionId: 'opt-b',
        explanationText: null,
        explanationImageUrl: null,
      },
    }
    mockFrom.mockReturnValue(
      buildSelectChain({
        data: [buildDraftRow({ session_config: null, feedback: feedbackData })],
        error: null,
      }),
    )

    const result = await loadDrafts()

    expect(result.drafts[0]!.feedback).toEqual(feedbackData)
    consoleSpy.mockRestore()
  })

  it('maps a valid draft row with no optional subject fields', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(
      buildSelectChain({
        data: [buildDraftRow({ session_config: { sessionId: 'sess-xyz' } })],
        error: null,
      }),
    )

    const result = await loadDrafts()

    expect(result.drafts[0]!.subjectName).toBeUndefined()
    expect(result.drafts[0]!.subjectCode).toBeUndefined()
    expect(result.drafts[0]!.sessionId).toBe('sess-xyz')
  })

  it('returns sessionId as empty string when session_config is null', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(
      buildSelectChain({ data: [buildDraftRow({ session_config: null })], error: null }),
    )

    const result = await loadDrafts()

    expect(result.drafts[0]!.sessionId).toBe('')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[rowToDraftData] Malformed session_config on draft',
      DRAFT_ID,
    )
    consoleSpy.mockRestore()
  })

  it('returns sessionId as empty string when session_config is missing sessionId', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(
      buildSelectChain({
        data: [buildDraftRow({ session_config: { subjectName: 'Navigation' } })],
        error: null,
      }),
    )

    const result = await loadDrafts()

    expect(result.drafts[0]!.sessionId).toBe('')
    expect(result.drafts[0]!.subjectName).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('returns sessionId as empty string when session_config is a non-object primitive', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(
      buildSelectChain({
        data: [buildDraftRow({ session_config: 'malformed-string' })],
        error: null,
      }),
    )

    const result = await loadDrafts()

    expect(result.drafts[0]!.sessionId).toBe('')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('preserves other draft fields even when session_config is malformed', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(
      buildSelectChain({
        data: [buildDraftRow({ session_config: null, current_index: 3 })],
        error: null,
      }),
    )

    const result = await loadDrafts()

    const draft = result.drafts[0]!
    expect(draft.id).toBe(DRAFT_ID)
    expect(draft.currentIndex).toBe(3)
    expect(draft.questionIds).toEqual(['q1', 'q2'])
    consoleSpy.mockRestore()
  })

  it('returns empty drafts when an unexpected error is thrown', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUser.mockRejectedValue(new Error('Unexpected failure'))

    const result = await loadDrafts()

    expect(result).toEqual({ drafts: [] })
    expect(consoleSpy).toHaveBeenCalledWith('[loadDrafts] Uncaught error:', expect.any(Error))
    consoleSpy.mockRestore()
  })
})
