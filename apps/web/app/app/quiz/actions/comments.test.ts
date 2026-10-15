import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockVerifySessionUser, mockFrom, mockFetchQuestionComments } = vi.hoisted(() => ({
  mockVerifySessionUser: vi.fn(),
  mockFrom: vi.fn(),
  mockFetchQuestionComments: vi.fn(),
}))

const mockClient = vi.hoisted(() => ({ from: mockFrom }))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
}))

vi.mock('./comment-queries', async () => {
  const actual = await vi.importActual<typeof import('./comment-queries')>('./comment-queries')
  return {
    ...actual,
    fetchQuestionComments: mockFetchQuestionComments,
  }
})

// ---- Subject under test ----------------------------------------------------

import { createComment, deleteComment, getComments } from './comments'

// ---- Helpers ---------------------------------------------------------------

/** Builds a fluent Supabase chain that resolves to the given return value. */
function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

// ---- Fixtures --------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const QUESTION_ID = '00000000-0000-4000-a000-000000000011'
const COMMENT_ID = '00000000-0000-4000-a000-000000000099'

const COMMENT_ROW = {
  id: COMMENT_ID,
  question_id: QUESTION_ID,
  user_id: USER_ID,
  body: 'Great question about altimetry.',
  created_at: '2026-03-20T10:00:00Z',
  users: { full_name: 'Alice Pilot', role: 'student' },
}

function setupAuthenticatedUser() {
  mockVerifySessionUser.mockResolvedValue({ id: USER_ID, email: null })
}

function setupUnauthenticated() {
  mockVerifySessionUser.mockResolvedValue(null)
}

// ---- Tests -----------------------------------------------------------------

describe('getComments', () => {
  it('returns an empty result when the session has no verified user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await getComments({ questionId: QUESTION_ID })
    expect(result).toEqual({ success: true, comments: [] })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ---- auth ----------------------------------------------------------------

  it('returns empty comment list when no user is signed in', async () => {
    setupUnauthenticated()

    const result = await getComments({ questionId: QUESTION_ID })

    expect(result).toEqual({ success: true, comments: [] })
  })

  // ---- input validation ----------------------------------------------------

  it('returns invalid-input error when questionId is not a UUID', async () => {
    setupAuthenticatedUser()

    const result = await getComments({ questionId: 'not-a-uuid' })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when input is null', async () => {
    setupAuthenticatedUser()

    const result = await getComments(null)

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when questionId is missing', async () => {
    setupAuthenticatedUser()

    const result = await getComments({})

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  // ---- happy path ----------------------------------------------------------

  it('returns comments for the given question when the query succeeds', async () => {
    setupAuthenticatedUser()
    mockFetchQuestionComments.mockResolvedValue({ data: [COMMENT_ROW], error: null })

    const result = await getComments({ questionId: QUESTION_ID })

    expect(result).toEqual({ success: true, comments: [COMMENT_ROW] })
  })

  it('returns an empty array when the question has no comments', async () => {
    setupAuthenticatedUser()
    mockFetchQuestionComments.mockResolvedValue({ data: [], error: null })

    const result = await getComments({ questionId: QUESTION_ID })

    expect(result).toEqual({ success: true, comments: [] })
  })

  // ---- error handling ------------------------------------------------------

  it('returns a failure when the database query errors', async () => {
    setupAuthenticatedUser()
    mockFetchQuestionComments.mockResolvedValue({
      data: [],
      error: { message: 'connection timeout' },
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await getComments({ questionId: QUESTION_ID })

    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Failed to load comments' })
  })
})

describe('createComment', () => {
  it('returns not-authenticated when the session has no verified user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await createComment({ questionId: QUESTION_ID, body: 'A comment.' })
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ---- auth ----------------------------------------------------------------

  it('returns not-authenticated error when no user is signed in', async () => {
    setupUnauthenticated()

    const result = await createComment({ questionId: QUESTION_ID, body: 'A comment.' })

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  // ---- input validation ----------------------------------------------------

  it('returns invalid-input error when questionId is not a UUID', async () => {
    setupAuthenticatedUser()

    const result = await createComment({ questionId: 'bad-id', body: 'A comment.' })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when body is empty', async () => {
    setupAuthenticatedUser()

    const result = await createComment({ questionId: QUESTION_ID, body: '' })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when body exceeds 2000 characters', async () => {
    setupAuthenticatedUser()
    const longBody = 'x'.repeat(2001)

    const result = await createComment({ questionId: QUESTION_ID, body: longBody })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when input is null', async () => {
    setupAuthenticatedUser()

    const result = await createComment(null)

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  // ---- happy path ----------------------------------------------------------

  it('returns the created comment on success', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: COMMENT_ROW, error: null }))

    const result = await createComment({
      questionId: QUESTION_ID,
      body: 'Great question about altimetry.',
    })

    expect(result).toEqual({ success: true, comment: COMMENT_ROW })
  })

  it('inserts into the question_comments table', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: COMMENT_ROW, error: null }))

    await createComment({ questionId: QUESTION_ID, body: 'A comment.' })

    expect(mockFrom).toHaveBeenCalledWith('question_comments')
  })

  it('accepts a comment body of exactly 2000 characters', async () => {
    setupAuthenticatedUser()
    const maxBody = 'x'.repeat(2000)
    mockFrom.mockReturnValue(buildChain({ data: { ...COMMENT_ROW, body: maxBody }, error: null }))

    const result = await createComment({ questionId: QUESTION_ID, body: maxBody })

    expect(result).toEqual({ success: true, comment: { ...COMMENT_ROW, body: maxBody } })
  })

  // ---- error handling ------------------------------------------------------

  it('returns a failure when the insert query errors', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'fk violation' } }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await createComment({ questionId: QUESTION_ID, body: 'A comment.' })

    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Failed to create comment' })
  })
})

describe('deleteComment', () => {
  it('returns not-authenticated when the session has no verified user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await deleteComment({ commentId: COMMENT_ID })
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ---- auth ----------------------------------------------------------------

  it('returns not-authenticated error when no user is signed in', async () => {
    setupUnauthenticated()

    const result = await deleteComment({ commentId: COMMENT_ID })

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  // ---- input validation ----------------------------------------------------

  it('returns invalid-input error when commentId is not a UUID', async () => {
    setupAuthenticatedUser()

    const result = await deleteComment({ commentId: 'not-a-uuid' })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when input is null', async () => {
    setupAuthenticatedUser()

    const result = await deleteComment(null)

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when commentId is missing', async () => {
    setupAuthenticatedUser()

    const result = await deleteComment({})

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  // ---- happy path ----------------------------------------------------------

  it('returns success when the comment is deleted', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [{ id: COMMENT_ID }], error: null }))

    const result = await deleteComment({ commentId: COMMENT_ID })

    expect(result).toEqual({ success: true })
  })

  it('returns error when comment not found or not owned', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await deleteComment({ commentId: COMMENT_ID })

    expect(result).toEqual({ success: false, error: 'Comment not found or not owned' })
  })

  it('deletes from the question_comments table', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [{ id: COMMENT_ID }], error: null }))

    await deleteComment({ commentId: COMMENT_ID })

    expect(mockFrom).toHaveBeenCalledWith('question_comments')
  })

  // ---- error handling ------------------------------------------------------

  it('returns a failure when the delete query errors', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ error: { message: 'row not found' } }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteComment({ commentId: COMMENT_ID })

    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Failed to delete comment' })
  })
})
