import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapResumeRpcError, RESUME_ERROR_MESSAGES } from './resume-error-messages'
import { loadResumeContext } from './resume-helpers'

describe('mapResumeRpcError', () => {
  it('tells the user to resolve their other active session when one is already active', () => {
    expect(mapResumeRpcError('another_session_active')).toMatch(/active session/i)
  })

  it('tells the user the saved questions are no longer available when the pool is invalid', () => {
    expect(mapResumeRpcError('invalid_question_ids')).toMatch(/no longer available/i)
  })

  it('tells the user the saved questions are no longer available when none remain', () => {
    expect(mapResumeRpcError('no_questions_provided')).toMatch(/no longer available/i)
  })

  it('returns a generic retry message for an unrecognized error', () => {
    expect(mapResumeRpcError('some_unexpected_db_error')).toMatch(/failed to resume/i)
  })

  it('returns a generic retry message when no error is given', () => {
    expect(mapResumeRpcError(undefined)).toMatch(/failed to resume/i)
  })

  // Guards the documented INVARIANT: mapResumeRpcError matches via token.includes(key),
  // so if one key were a substring of another, iteration order (not specificity) would
  // decide the mapping. Fails the moment a future key addition breaks the invariant.
  it('keeps every error key free of being a substring of another key', () => {
    const keys = Object.keys(RESUME_ERROR_MESSAGES)
    for (const a of keys) {
      for (const b of keys) {
        if (a !== b) expect(b.includes(a)).toBe(false)
      }
    }
  })
})

// ---- Helpers ----------------------------------------------------------------

/**
 * Proxy-based chain builder. Chained method calls return the proxy; the named
 * terminal method returns `result`. Non-thenable (no `.then`).
 */
function buildChain(result: unknown, terminal: string) {
  const proxy: object = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') return undefined
        if (prop === terminal) return () => result
        return () => proxy
      },
    },
  )
  return proxy
}

type FakeClient = Parameters<typeof loadResumeContext>[0]

/** Build a client that returns `draftResult` from the draft query, and (if
 *  provided) `sessionResult` from the subsequent session query. Both use
 *  `.maybeSingle()` as the terminal. */
function makeLoadClient(draftResult: unknown, sessionResult?: unknown): FakeClient {
  const fromFn = vi.fn()
  fromFn.mockImplementationOnce(() => buildChain(draftResult, 'maybeSingle'))
  if (sessionResult !== undefined) {
    fromFn.mockImplementationOnce(() => buildChain(sessionResult, 'maybeSingle'))
  }
  return { from: fromFn } as unknown as FakeClient
}

// ---- Fixtures ---------------------------------------------------------------

const DRAFT_ID = '00000000-0000-4000-a000-000000000050'
const SESSION_ID = '00000000-0000-4000-a000-000000000002'
const USER_ID = '00000000-0000-4000-a000-000000000001'
const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const TOPIC_ID = '00000000-0000-4000-a000-000000000011'

const DRAFT_ROW = {
  question_ids: ['00000000-0000-4000-a000-000000000099'],
  session_config: { sessionId: SESSION_ID, subjectName: 'Meteorology', subjectCode: 'MET' },
  answers: {
    '00000000-0000-4000-a000-000000000099': { selectedOptionId: 'b', responseTimeMs: 900 },
  },
  current_index: 0,
}

const QUICK_QUIZ_SESSION = { mode: 'quick_quiz', subject_id: SUBJECT_ID, topic_id: TOPIC_ID }
const SMART_REVIEW_SESSION = { mode: 'smart_review', subject_id: null, topic_id: null }

// ---- loadResumeContext ------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('loadResumeContext', () => {
  it('returns failure when the draft lookup query fails', async () => {
    const client = makeLoadClient({ data: null, error: { message: 'db error' } })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('Failed to resume this saved quiz.')
    expect(errSpy).toHaveBeenCalledWith('[resumeQuizSession] Draft lookup error:', 'db error')
  })

  it('returns failure when the saved quiz is not found', async () => {
    const client = makeLoadClient({ data: null, error: null })

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('Saved quiz not found.')
  })

  it('returns failure when the draft has no question ids', async () => {
    const client = makeLoadClient({
      data: { ...DRAFT_ROW, question_ids: [] },
      error: null,
    })

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('This saved quiz has no questions.')
  })

  it('returns failure when the session reference is absent from the saved config', async () => {
    const client = makeLoadClient({
      data: { ...DRAFT_ROW, session_config: {} },
      error: null,
    })

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('This saved quiz is missing its session reference.')
  })

  it('returns failure when the session reference is a non-string value', async () => {
    // session_config.sessionId must be a string; a number value must be rejected
    const client = makeLoadClient({
      data: { ...DRAFT_ROW, session_config: { sessionId: 42 } },
      error: null,
    })

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('This saved quiz is missing its session reference.')
  })

  it.each([[''], ['not-a-uuid']])(
    'returns failure without looking up a session when the session reference is %j',
    async (sessionId) => {
      const client = makeLoadClient(
        { data: { ...DRAFT_ROW, session_config: { sessionId } }, error: null },
        { data: { mode: 'quick_quiz', subject_id: SUBJECT_ID, topic_id: null }, error: null },
      )

      const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected failure')
      expect(result.error).toBe('This saved quiz is missing its session reference.')
      expect(client.from).toHaveBeenCalledTimes(1)
    },
  )

  it('returns failure when the session lookup query fails', async () => {
    const client = makeLoadClient(
      { data: DRAFT_ROW, error: null },
      { data: null, error: { message: 'session db error' } },
    )
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('Failed to resume this saved quiz.')
    expect(errSpy).toHaveBeenCalledWith(
      '[resumeQuizSession] Session lookup error:',
      'session db error',
    )
  })

  it('returns failure when the session is no longer available', async () => {
    const client = makeLoadClient({ data: DRAFT_ROW, error: null }, { data: null, error: null })

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('The original session for this saved quiz is unavailable.')
  })

  it('returns failure when the session is a non-practice mode', async () => {
    const client = makeLoadClient(
      { data: DRAFT_ROW, error: null },
      { data: { mode: 'internal_exam', subject_id: SUBJECT_ID, topic_id: null }, error: null },
    )

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('This saved quiz can’t be resumed.')
  })

  it('returns failure when a quick-quiz session has no subject', async () => {
    const client = makeLoadClient(
      { data: DRAFT_ROW, error: null },
      { data: { mode: 'quick_quiz', subject_id: null, topic_id: null }, error: null },
    )

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('The original session for this saved quiz is missing its subject.')
  })

  it('allows a smart-review session with a null subject', async () => {
    // smart_review is cross-subject by design; start_quiz_session accepts null subject_id
    const client = makeLoadClient(
      { data: DRAFT_ROW, error: null },
      { data: SMART_REVIEW_SESSION, error: null },
    )

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.ctx.mode).toBe('smart_review')
    expect(result.ctx.subjectId).toBeNull()
  })

  it('returns the full session context for a valid quick-quiz draft', async () => {
    const client = makeLoadClient(
      { data: DRAFT_ROW, error: null },
      { data: QUICK_QUIZ_SESSION, error: null },
    )

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.ctx).toMatchObject({
      oldSessionId: SESSION_ID,
      questionIds: DRAFT_ROW.question_ids,
      mode: 'quick_quiz',
      subjectId: SUBJECT_ID,
      topicId: TOPIC_ID,
      subjectName: 'Meteorology',
      subjectCode: 'MET',
    })
  })

  it('carries the draft answers and position for seeding the new session', async () => {
    const client = makeLoadClient(
      { data: { ...DRAFT_ROW, current_index: 4 }, error: null },
      { data: QUICK_QUIZ_SESSION, error: null },
    )

    const result = await loadResumeContext(client, DRAFT_ID, USER_ID)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.ctx.answers).toEqual(DRAFT_ROW.answers)
    expect(result.ctx.currentIndex).toBe(4)
  })
})
