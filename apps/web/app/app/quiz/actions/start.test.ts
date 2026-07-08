import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockRpc, mockGetRandomQuestionIds } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockGetRandomQuestionIds: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
}))

vi.mock('@/lib/queries/quiz-session-queries', () => ({
  getRandomQuestionIds: mockGetRandomQuestionIds,
}))

// ---- Subject under test ---------------------------------------------------

import { startQuizSession } from './start'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('startQuizSession', () => {
  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when authentication fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when no questions are available', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue([])
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('No questions available for this selection')
  })

  it('surfaces a session-start failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1', 'q2'])
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start session')
  })

  it('tells the user to finish their other session when one is already active', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1', 'q2'])
    mockRpc.mockResolvedValue({ data: null, error: { message: 'another_session_active' } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe(
      'You already have an active session. Finish or discard it before starting a new one.',
    )
  })

  it('returns success with sessionId and questionIds on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1', 'q2', 'q3'])
    mockRpc.mockResolvedValue({ data: 'session-123', error: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 3,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sessionId).toBe('session-123')
    expect(result.questionIds).toEqual(['q1', 'q2', 'q3'])
  })

  it('passes topicIds array to getRandomQuestionIds', async () => {
    const TOPIC_ID = '00000000-0000-4000-a000-000000000020'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      topicIds: [TOPIC_ID],
      count: 1,
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ topicIds: [TOPIC_ID] }),
    )
  })

  it('passes subtopicIds array to getRandomQuestionIds', async () => {
    const SUBTOPIC_ID = '00000000-0000-4000-a000-000000000030'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      subtopicIds: [SUBTOPIC_ID],
      count: 1,
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ subtopicIds: [SUBTOPIC_ID] }),
    )
  })

  it('passes filters array to getRandomQuestionIds', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
      filters: ['unseen', 'incorrect'],
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['unseen', 'incorrect'] }),
    )
  })

  it("defaults filters to ['all'] when omitted", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ filters: ['all'] }),
    )
  })

  it('passes calcMode through to getRandomQuestionIds', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
      calcMode: 'only',
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ calcMode: 'only' }),
    )
  })

  it("defaults calcMode to 'all' when omitted", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ calcMode: 'all' }),
    )
  })

  it('rejects an unknown calcMode value', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
      calcMode: 'sometimes',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('filters the question pool by image presence when imageMode is provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
      imageMode: 'only',
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ imageMode: 'only' }),
    )
  })

  it("defaults imageMode to 'all' when omitted", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ imageMode: 'all' }),
    )
  })

  it('rejects an unknown imageMode value', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
      imageMode: 'sometimes',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('includes the selected question type in the start request payload', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
      questionType: 'ordering',
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ questionType: 'ordering' }),
    )
  })

  it('does not restrict the question type when none is selected', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ questionType: undefined }),
    )
  })

  it('rejects an unknown questionType value', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
      questionType: 'true_false',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('rejects unauthenticated calls before input validation', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await startQuizSession({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Not authenticated')
  })

  it('returns failure for an invalid quiz configuration (missing subjectId)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure for a non-UUID subject ID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({ subjectId: 'not-a-uuid', count: 5 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when topicIds contains a non-UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      topicIds: ['not-a-uuid'],
      count: 5,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when subtopicIds contains a non-UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      subtopicIds: ['bad-id'],
      count: 5,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when filters contains an unknown value', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 5,
      filters: ['random'],
    })
    expect(result.success).toBe(false)
  })

  it('accepts count at the maximum allowed value (500)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 500,
    })
    expect(result.success).toBe(true)
  })

  it('rejects count above the 500 question cap', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 501,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure and logs when an unexpected error is thrown', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockRejectedValue(new Error('unexpected DB failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await startQuizSession({
        subjectId: '00000000-0000-4000-a000-000000000001',
        count: 5,
      })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[startQuizSession] Uncaught error:',
        expect.any(Error),
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
