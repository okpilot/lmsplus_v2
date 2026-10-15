import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockVerifySessionUser, mockRpc, mockGetRandomQuestionIds } = vi.hoisted(() => ({
  mockVerifySessionUser: vi.fn(),
  mockRpc: vi.fn(),
  mockGetRandomQuestionIds: vi.fn(),
}))

const mockClient = vi.hoisted(() => ({}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
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
  it('returns not-authenticated when the session has no verified user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 5,
    })
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  it('returns failure when no questions are available', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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

  it('flags the start as blocked when another session is already active', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    mockGetRandomQuestionIds.mockResolvedValue(['q1', 'q2'])
    mockRpc.mockResolvedValue({ data: null, error: { message: 'another_session_active' } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 5,
    })
    expect(result).toMatchObject({ success: false, blocked: true })
  })

  it('does not flag the start as blocked for an unrelated failure', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    mockGetRandomQuestionIds.mockResolvedValue(['q1', 'q2'])
    mockRpc.mockResolvedValue({ data: null, error: { message: 'unexpected db failure' } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 5,
    })
    expect(result.success).toBe(false)
    expect(result).not.toHaveProperty('blocked', true)
  })

  it('returns success with sessionId and questionIds on happy path', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
      calcMode: 'sometimes',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('filters the question pool by image presence when imageMode is provided', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 1,
      imageMode: 'sometimes',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('rejects unauthenticated calls before input validation', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await startQuizSession({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Not authenticated')
  })

  it('returns failure for an invalid quiz configuration (missing subjectId)', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    const result = await startQuizSession({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure for a non-UUID subject ID', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    const result = await startQuizSession({ subjectId: 'not-a-uuid', count: 5 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when topicIds contains a non-UUID', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      topicIds: ['not-a-uuid'],
      count: 5,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when subtopicIds contains a non-UUID', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      subtopicIds: ['bad-id'],
      count: 5,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when filters contains an unknown value', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 5,
      filters: ['random'],
    })
    expect(result.success).toBe(false)
  })

  it('accepts count at the maximum allowed value (500)', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    mockGetRandomQuestionIds.mockResolvedValue(['q1'])
    mockRpc.mockResolvedValue({ data: 'sess-1', error: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 500,
    })
    expect(result.success).toBe(true)
  })

  it('rejects count above the 500 question cap', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-4000-a000-000000000001',
      count: 501,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure and logs when an unexpected error is thrown', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
