import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))

const { mockEndDiscovery } = vi.hoisted(() => ({
  mockEndDiscovery: vi.fn(),
}))

const mockClient = vi.hoisted(() => ({}))

vi.mock('./end-discovery', () => ({
  endDiscovery: (...args: unknown[]) => mockEndDiscovery(...args),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { startStudy } from './study'

// ---- Fixtures -------------------------------------------------------------

const VALID_SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const CREATED_SESSION_ID = '00000000-0000-4000-a000-0000000000ff'
const VALID_INPUT = { subjectId: VALID_SUBJECT_ID, count: 10 }
const Q1 = '00000000-0000-4000-a000-000000000011'
const Q2 = '00000000-0000-4000-a000-000000000022'

function makeRow(id: string): Record<string, unknown> {
  return {
    id,
    question_text: 'What is the MATZ horizontal radius?',
    question_image_url: null,
    options: [
      { id: 'a', text: '2 nm' },
      { id: 'b', text: '5 nm' },
    ],
    correct_option_id: 'b',
    subject_code: 'ALW',
    topic_name: 'Airspace',
    subtopic_name: null,
    explanation_text: 'A MATZ extends 5 nm from the aerodrome.',
    explanation_image_url: null,
    question_number: null,
    difficulty: null,
  }
}

function started(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      session_id: CREATED_SESSION_ID,
      questions: [makeRow(Q1), makeRow(Q2)],
      flagged_ids: [],
      ...overrides,
    },
    error: null,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRpc.mockResolvedValue(started())
  mockEndDiscovery.mockResolvedValue({ success: true })
})

// ---- Validation -----------------------------------------------------------

describe('startStudy — input validation', () => {
  it.each([
    ['subjectId is not a valid UUID', { subjectId: 'not-a-uuid', count: 10 }],
    ['count is missing', { subjectId: VALID_SUBJECT_ID }],
    ['count is below the minimum', { subjectId: VALID_SUBJECT_ID, count: 0 }],
    ['count exceeds the maximum allowed', { subjectId: VALID_SUBJECT_ID, count: 501 }],
  ])('returns a validation error when %s', async (_label, input) => {
    const result = await startStudy(input)
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('does not call the RPC when input is invalid', async () => {
    await startStudy({ subjectId: 'bad' })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

// ---- The one RPC ----------------------------------------------------------

describe('startStudy — single RPC call', () => {
  it('starts the study session with one RPC carrying the whole selection', async () => {
    const topicIds = ['00000000-0000-4000-a000-000000000030']
    const subtopicIds = ['00000000-0000-4000-a000-000000000040']
    await startStudy({
      ...VALID_INPUT,
      topicIds,
      subtopicIds,
      filters: ['flagged'],
      calcMode: 'exclude',
      imageMode: 'only',
    })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith(mockClient, 'start_discovery', {
      p_subject_id: VALID_SUBJECT_ID,
      p_topic_ids: topicIds,
      p_subtopic_ids: subtopicIds,
      p_count: 10,
      p_filters: ['flagged'],
      p_calc_mode: 'exclude',
      p_has_image: 'only',
    })
  })

  it('sends null scopes and empty filters with the all defaults when the selection omits them', async () => {
    // p_filters has no DB default: an omitted key would miss the function signature.
    await startStudy(VALID_INPUT)
    expect(mockRpc).toHaveBeenCalledWith(mockClient, 'start_discovery', {
      p_subject_id: VALID_SUBJECT_ID,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 10,
      p_filters: [],
      p_calc_mode: 'all',
      p_has_image: 'all',
    })
  })
})

// ---- Empty pool -----------------------------------------------------------

describe('startStudy — empty question pool', () => {
  it('returns an empty study set without a session id when nothing matches', async () => {
    mockRpc.mockResolvedValue({
      data: { session_id: null, questions: [], flagged_ids: [] },
      error: null,
    })
    const result = await startStudy(VALID_INPUT)
    expect(result).toEqual({ success: true, questions: [], flaggedIds: [] })
  })
})

// ---- Happy path ----------------------------------------------------------

describe('startStudy — happy path', () => {
  it('returns the questions in draw order with the answer key and the session id', async () => {
    mockRpc.mockResolvedValue(started({ questions: [makeRow(Q2), makeRow(Q1)] }))
    const result = await startStudy(VALID_INPUT)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions.map((q) => q.id)).toEqual([Q2, Q1])
    expect(result.questions[0]).toMatchObject({
      correctOptionId: 'b',
      questionText: 'What is the MATZ horizontal radius?',
      options: [
        { id: 'a', text: '2 nm' },
        { id: 'b', text: '5 nm' },
      ],
    })
    expect(result.sessionId).toBe(CREATED_SESSION_ID)
  })

  it('returns the flagged ids among the started questions', async () => {
    mockRpc.mockResolvedValue(started({ flagged_ids: [Q1] }))
    const result = await startStudy(VALID_INPUT)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.flaggedIds).toEqual([Q1])
  })

  it('ignores non-string entries in the flagged ids', async () => {
    mockRpc.mockResolvedValue(started({ flagged_ids: [Q1, 42, null] }))
    const result = await startStudy(VALID_INPUT)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.flaggedIds).toEqual([Q1])
  })

  it('returns no flagged ids when the flagged payload is not an array', async () => {
    mockRpc.mockResolvedValue(started({ flagged_ids: 'nope' }))
    const result = await startStudy(VALID_INPUT)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.flaggedIds).toEqual([])
  })
})

// ---- Error path ----------------------------------------------------------

describe('startStudy — error path', () => {
  it('tells the user to finish their other session when one is already active', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'another_session_active' } })
    const result = await startStudy(VALID_INPUT)
    expect(result).toEqual({ success: false, error: 'Finish or exit your active session first.' })
  })

  it('returns a generic failure for any other RPC error without leaking the token', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'internal_secret_db_detail' } })
    const result = await startStudy(VALID_INPUT)
    expect(result).toEqual({ success: false, error: 'Failed to start study session' })
  })

  it.each([
    ['null payload', null],
    ['non-object payload', 'oops'],
    ['non-string session id', { session_id: 42, questions: [makeRow(Q1)], flagged_ids: [] }],
    [
      'session without any parseable question',
      { session_id: CREATED_SESSION_ID, questions: [{ id: 1 }], flagged_ids: [] },
    ],
    [
      'session with a non-array questions field',
      { session_id: CREATED_SESSION_ID, questions: 'x' },
    ],
  ])('fails with a generic message on a malformed payload (%s)', async (_label, data) => {
    mockRpc.mockResolvedValue({ data, error: null })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startStudy(VALID_INPUT)
    expect(result).toEqual({ success: false, error: 'Failed to start study session' })
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('returns a generic error message when an unexpected exception is thrown', async () => {
    mockRpc.mockRejectedValue(new Error('internal_secret_db_detail'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startStudy(VALID_INPUT)
    expect(result).toEqual({ success: false, error: 'Failed to start study session' })
    expect(consoleSpy).toHaveBeenCalledWith('[startStudy] error:', expect.any(Error))
  })
})

// ---- Orphan teardown -----------------------------------------------------

describe('startStudy — malformed payload that already created a session', () => {
  const GENERIC = { success: false, error: 'Failed to start study session' }

  it.each([
    ['questions is null', { questions: null }],
    ['questions is not an array', { questions: 'x' }],
    ['questions are all unparseable', { questions: [{ id: 1 }] }],
    ['some questions are unparseable', { questions: [makeRow(Q1), { id: 1 }] }],
    ['the question list is empty', { questions: [] }],
  ])('ends the created discovery session and fails generically when %s', async (_l, overrides) => {
    mockRpc.mockResolvedValue(started(overrides))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startStudy(VALID_INPUT)
    expect(result).toEqual(GENERIC)
    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    expect(mockEndDiscovery).toHaveBeenCalledWith({ sessionId: CREATED_SESSION_ID })
  })

  it('does not end any session when the payload carries no session id', async () => {
    mockRpc.mockResolvedValue(started({ session_id: 42 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await startStudy(VALID_INPUT)
    expect(mockEndDiscovery).not.toHaveBeenCalled()
  })

  it('does not end any session on a valid start', async () => {
    await startStudy(VALID_INPUT)
    expect(mockEndDiscovery).not.toHaveBeenCalled()
  })

  it('logs a failed teardown result and still fails generically', async () => {
    mockRpc.mockResolvedValue(started({ questions: null }))
    mockEndDiscovery.mockResolvedValue({ success: false, error: 'boom' })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startStudy(VALID_INPUT)
    expect(result).toEqual(GENERIC)
    expect(consoleSpy).toHaveBeenCalledWith(
      '[startStudy] discovery teardown failed:',
      CREATED_SESSION_ID,
      'boom',
    )
  })

  it('logs a thrown teardown and still fails generically', async () => {
    mockRpc.mockResolvedValue(started({ questions: null }))
    mockEndDiscovery.mockRejectedValue(new Error('network'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await startStudy(VALID_INPUT)
    expect(result).toEqual(GENERIC)
    expect(consoleSpy).toHaveBeenCalledWith(
      '[startStudy] discovery teardown failed:',
      CREATED_SESSION_ID,
      'unknown error',
    )
  })
})
