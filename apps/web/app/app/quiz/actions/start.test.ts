import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockVerifySessionUser, mockRpc } = vi.hoisted(() => ({
  mockVerifySessionUser: vi.fn(),
  mockRpc: vi.fn(),
}))

const mockClient = vi.hoisted(() => ({ rpc: mockRpc }))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
}))

// ---- Subject under test ---------------------------------------------------

import { startQuizSession } from './start'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const TOPIC_ID = '00000000-0000-4000-a000-000000000020'
const SUBTOPIC_ID = '00000000-0000-4000-a000-000000000030'
const SESSION_ID = '00000000-0000-4000-a000-0000000000aa'

function started(questionIds: string[] = ['q1', 'q2', 'q3']) {
  return { data: { session_id: SESSION_ID, question_ids: questionIds }, error: null }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
  mockRpc.mockResolvedValue(started())
})

// ---- Tests ----------------------------------------------------------------

describe('startQuizSession', () => {
  it('returns not-authenticated when the session has no verified user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await startQuizSession({ subjectId: SUBJECT_ID, count: 5 })
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated calls before input validation', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await startQuizSession({})
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('starts a quiz with a single RPC call carrying the whole selection', async () => {
    await startQuizSession({
      subjectId: SUBJECT_ID,
      topicIds: [TOPIC_ID],
      subtopicIds: [SUBTOPIC_ID],
      count: 7,
      filters: ['unseen', 'incorrect'],
      calcMode: 'only',
      imageMode: 'exclude',
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('start_practice_quiz', {
      p_subject_id: SUBJECT_ID,
      p_topic_ids: [TOPIC_ID],
      p_subtopic_ids: [SUBTOPIC_ID],
      p_count: 7,
      p_filters: ['unseen', 'incorrect'],
      p_calc_mode: 'only',
      p_has_image: 'exclude',
    })
    expect(mockRpc.mock.contexts[0]).toBe(mockClient)
  })

  it("sends null scopes and the 'all' defaults when the selection omits them", async () => {
    await startQuizSession({ subjectId: SUBJECT_ID, count: 5 })
    expect(mockRpc).toHaveBeenCalledWith('start_practice_quiz', {
      p_subject_id: SUBJECT_ID,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 5,
      p_filters: ['all'],
      p_calc_mode: 'all',
      p_has_image: 'all',
    })
    expect(mockRpc.mock.contexts[0]).toBe(mockClient)
  })

  it('returns the session id and question ids in draw order on success', async () => {
    mockRpc.mockResolvedValue(started(['q3', 'q1', 'q2']))
    const result = await startQuizSession({ subjectId: SUBJECT_ID, count: 3 })
    expect(result).toEqual({
      success: true,
      sessionId: SESSION_ID,
      questionIds: ['q3', 'q1', 'q2'],
    })
  })

  it('accepts count at the maximum allowed value (500)', async () => {
    const result = await startQuizSession({ subjectId: SUBJECT_ID, count: 500 })
    expect(result.success).toBe(true)
  })

  it('reports no questions when the draw is empty', async () => {
    mockRpc.mockResolvedValue({ data: { session_id: null, question_ids: [] }, error: null })
    const result = await startQuizSession({ subjectId: SUBJECT_ID, count: 5 })
    expect(result).toEqual({ success: false, error: 'No questions available for this selection' })
  })

  it.each([
    ['null payload', null],
    ['non-object payload', 'session-123'],
    ['missing session id', { question_ids: ['q1'] }],
    ['non-string session id', { session_id: 42, question_ids: ['q1'] }],
    ['empty session id', { session_id: '', question_ids: ['q1'] }],
    ['non-array question ids', { session_id: SESSION_ID, question_ids: 'q1' }],
    ['non-string question id', { session_id: SESSION_ID, question_ids: ['q1', 7] }],
    ['session without questions', { session_id: SESSION_ID, question_ids: [] }],
  ])('fails with a generic message on a malformed payload (%s)', async (_label, data) => {
    mockRpc.mockResolvedValue({ data, error: null })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startQuizSession({ subjectId: SUBJECT_ID, count: 5 })
    expect(result).toEqual({ success: false, error: 'Failed to start session' })
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('surfaces a session-start failure without leaking the database error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const result = await startQuizSession({ subjectId: SUBJECT_ID, count: 5 })
    expect(result).toEqual({ success: false, error: 'Failed to start session' })
  })

  it('tells the user to finish their other session when one is already active', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'another_session_active' } })
    const result = await startQuizSession({ subjectId: SUBJECT_ID, count: 5 })
    expect(result).toEqual({
      success: false,
      error: 'You already have an active session. Finish or discard it before starting a new one.',
      blocked: true,
    })
  })

  it('does not flag the start as blocked for an unrelated failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'unexpected db failure' } })
    const result = await startQuizSession({ subjectId: SUBJECT_ID, count: 5 })
    expect(result.success).toBe(false)
    expect(result).not.toHaveProperty('blocked', true)
  })

  it.each([
    ['missing subjectId', {}],
    ['non-UUID subject ID', { subjectId: 'not-a-uuid', count: 5 }],
    ['non-UUID topic ID', { subjectId: SUBJECT_ID, topicIds: ['not-a-uuid'], count: 5 }],
    ['non-UUID subtopic ID', { subjectId: SUBJECT_ID, subtopicIds: ['bad-id'], count: 5 }],
    ['unknown filter', { subjectId: SUBJECT_ID, count: 5, filters: ['random'] }],
    ['unknown calcMode', { subjectId: SUBJECT_ID, count: 1, calcMode: 'sometimes' }],
    ['unknown imageMode', { subjectId: SUBJECT_ID, count: 1, imageMode: 'sometimes' }],
    ['count above the 500 cap', { subjectId: SUBJECT_ID, count: 501 }],
  ])('rejects invalid input without calling the RPC (%s)', async (_label, input) => {
    const result = await startQuizSession(input)
    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns failure and logs when an unexpected error is thrown', async () => {
    mockRpc.mockRejectedValue(new Error('unexpected DB failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startQuizSession({ subjectId: SUBJECT_ID, count: 5 })
    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
    expect(consoleSpy).toHaveBeenCalledWith('[startQuizSession] Uncaught error:', expect.any(Error))
  })
})
