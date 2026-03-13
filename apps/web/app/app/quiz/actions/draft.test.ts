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

import { saveDraft } from './draft'
import { deleteDraft } from './draft-delete'
import { loadDrafts } from './load-draft'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-0000-0000-000000000001'
const ORG_ID = '00000000-0000-0000-0000-000000000099'
const SESSION_ID = '00000000-0000-0000-0000-000000000002'
const DRAFT_ID = '00000000-0000-0000-0000-000000000050'
const Q1_ID = '00000000-0000-0000-0000-000000000011'
const Q2_ID = '00000000-0000-0000-0000-000000000022'

const VALID_DRAFT_INPUT = {
  sessionId: SESSION_ID,
  questionIds: [Q1_ID, Q2_ID],
  answers: {
    [Q1_ID]: { selectedOptionId: 'opt-a', responseTimeMs: 2000 },
  },
  currentIndex: 1,
}

const DRAFT_ROW = {
  id: DRAFT_ID,
  student_id: USER_ID,
  organization_id: ORG_ID,
  session_config: { sessionId: SESSION_ID },
  question_ids: [Q1_ID, Q2_ID],
  answers: { [Q1_ID]: { selectedOptionId: 'opt-a', responseTimeMs: 2000 } },
  current_index: 1,
  created_at: '2026-03-12T00:00:00Z',
  updated_at: '2026-03-12T00:00:00Z',
}

// ---- Helpers --------------------------------------------------------------

function mockChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    insert: vi.fn().mockReturnValue({ error: null, ...overrides }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnValue({ data: [DRAFT_ROW], error: null }),
    single: vi.fn().mockReturnValue({ data: { organization_id: ORG_ID }, error: null }),
    maybeSingle: vi.fn().mockReturnValue({ data: DRAFT_ROW, error: null }),
    delete: vi.fn().mockReturnThis(),
  }
  // Make chainable methods return the chain itself
  for (const key of ['select', 'eq', 'delete']) {
    ;(chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain)
  }
  return chain
}

function mockChainWithCount(count: number, countError: unknown = null) {
  const chain = mockChain()
  // select('*', { count: 'exact', head: true }) returns count info
  ;(chain.select as ReturnType<typeof vi.fn>).mockImplementation(
    (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === 'exact') {
        return {
          eq: vi.fn().mockReturnValue({ count, error: countError }),
        }
      }
      return chain
    },
  )
  return chain
}

function setupAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
}

function setupUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- saveDraft -------------------------------------------------------------

describe('saveDraft', () => {
  it('returns failure when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await saveDraft(VALID_DRAFT_INPUT)
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns failure when input fails Zod validation', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({ sessionId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('returns failure when organization_id is not found', async () => {
    setupAuthenticatedUser()
    const chain = mockChainWithCount(0)
    ;(chain.single as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await saveDraft(VALID_DRAFT_INPUT)
    expect(result).toEqual({ success: false, error: 'User organization not found' })
  })

  it('returns failure when draft limit of 20 is reached', async () => {
    setupAuthenticatedUser()
    // First call: count query returns 20; second call: users table for orgId
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // users table for orgId
        const chain = mockChain()
        return chain
      }
      // quiz_drafts count query
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ count: 20, error: null }),
        }),
        insert: vi.fn(),
      }
    })

    // Set up so first from('users') returns org, second from('quiz_drafts') returns count=20
    mockFrom.mockImplementationOnce(() => {
      const chain = mockChain()
      return chain
    })
    mockFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ count: 20, error: null }),
      }),
      insert: vi.fn(),
    }))

    const result = await saveDraft(VALID_DRAFT_INPUT)
    expect(result).toEqual({ success: false, error: 'Maximum 20 saved quizzes reached.' })
  })

  it('returns success on happy path', async () => {
    setupAuthenticatedUser()
    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) {
        // users org lookup
        return mockChain()
      }
      if (callIndex === 2) {
        // count query
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ count: 0, error: null }),
          }),
        }
      }
      // insert
      return { insert: vi.fn().mockReturnValue({ error: null }) }
    })

    const result = await saveDraft(VALID_DRAFT_INPUT)
    expect(result).toEqual({ success: true })
  })

  it('returns failure when insert errors', async () => {
    setupAuthenticatedUser()
    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) return mockChain()
      if (callIndex === 2) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ count: 0, error: null }),
          }),
        }
      }
      return { insert: vi.fn().mockReturnValue({ error: { message: 'db error' } }) }
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await saveDraft(VALID_DRAFT_INPUT)

    expect(result).toEqual({ success: false, error: 'Failed to save draft' })
    consoleSpy.mockRestore()
  })

  it('validates that questionIds must be UUIDs', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      questionIds: ['not-a-uuid'],
    })
    expect(result.success).toBe(false)
  })

  it('validates that answers have non-negative responseTimeMs', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: { [Q1_ID]: { selectedOptionId: 'a', responseTimeMs: -1 } },
    })
    expect(result.success).toBe(false)
  })

  it('returns failure when currentIndex equals questionIds.length (out of range)', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    mockFrom.mockReturnValue(chain)

    // questionIds has 2 items (indices 0-1), currentIndex 2 is out of range
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      currentIndex: 2,
    })
    expect(result).toEqual({ success: false, error: 'Current index out of range' })
  })

  it('returns failure when currentIndex exceeds questionIds.length', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    mockFrom.mockReturnValue(chain)

    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      currentIndex: 99,
    })
    expect(result).toEqual({ success: false, error: 'Current index out of range' })
  })
})

// ---- loadDrafts ------------------------------------------------------------

describe('loadDrafts', () => {
  it('returns empty drafts array when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await loadDrafts()
    expect(result).toEqual({ drafts: [] })
  })

  it('returns empty drafts array when no drafts exist', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    ;(chain.order as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], error: null })
    mockFrom.mockReturnValue(chain)

    const result = await loadDrafts()
    expect(result).toEqual({ drafts: [] })
  })

  it('returns drafts array on happy path', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    mockFrom.mockReturnValue(chain)

    const result = await loadDrafts()
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0]).toEqual({
      id: DRAFT_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID, Q2_ID],
      answers: { [Q1_ID]: { selectedOptionId: 'opt-a', responseTimeMs: 2000 } },
      currentIndex: 1,
      subjectName: undefined,
      subjectCode: undefined,
      createdAt: '2026-03-12T00:00:00Z',
    })
  })

  it('returns multiple drafts ordered by updated_at desc', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    const row2 = { ...DRAFT_ROW, id: 'draft-2', session_config: { sessionId: 'sess-2' } }
    ;(chain.order as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [DRAFT_ROW, row2],
      error: null,
    })
    mockFrom.mockReturnValue(chain)

    const result = await loadDrafts()
    expect(result.drafts).toHaveLength(2)
    expect(result.drafts[0]?.id).toBe(DRAFT_ID)
    expect(result.drafts[1]?.id).toBe('draft-2')
  })

  it('returns subjectName and subjectCode when present in session_config', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    const rowWithSubject = {
      ...DRAFT_ROW,
      session_config: { sessionId: SESSION_ID, subjectName: 'Air Law', subjectCode: 'ALW' },
    }
    ;(chain.order as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [rowWithSubject],
      error: null,
    })
    mockFrom.mockReturnValue(chain)

    const result = await loadDrafts()
    expect(result.drafts[0]?.subjectName).toBe('Air Law')
    expect(result.drafts[0]?.subjectCode).toBe('ALW')
  })

  it('returns empty drafts when query errors', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    ;(chain.order as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      error: { message: 'db error' },
    })
    mockFrom.mockReturnValue(chain)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await loadDrafts()
    expect(result).toEqual({ drafts: [] })
    consoleSpy.mockRestore()
  })
})

// ---- saveDraft — update path (draftId provided) ----------------------------

describe('saveDraft — update path', () => {
  it('updates an existing draft when draftId is provided', async () => {
    setupAuthenticatedUser()

    // Chain: update → eq(id) → eq(student_id) → select(id) → { data, error }
    const selectFn = vi.fn().mockReturnValue({ data: [{ id: DRAFT_ID }], error: null })
    const updateEq2 = vi.fn().mockReturnValue({ select: selectFn })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })

    // Update path skips org lookup — only one from() call for quiz_drafts
    mockFrom.mockReturnValue({ update: updateFn })

    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      draftId: DRAFT_ID,
    })

    expect(result).toEqual({ success: true })
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        question_ids: VALID_DRAFT_INPUT.questionIds,
        current_index: VALID_DRAFT_INPUT.currentIndex,
      }),
    )
  })

  it('scopes update to the authenticated user via student_id filter', async () => {
    setupAuthenticatedUser()

    const selectFn = vi.fn().mockReturnValue({ data: [{ id: DRAFT_ID }], error: null })
    const updateEq2 = vi.fn().mockReturnValue({ select: selectFn })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })

    mockFrom.mockReturnValue({ update: updateFn })

    await saveDraft({ ...VALID_DRAFT_INPUT, draftId: DRAFT_ID })

    expect(updateEq1).toHaveBeenCalledWith('id', DRAFT_ID)
    expect(updateEq2).toHaveBeenCalledWith('student_id', USER_ID)
  })

  it('returns failure when the update query errors', async () => {
    setupAuthenticatedUser()

    const selectFn = vi.fn().mockReturnValue({ data: null, error: { message: 'RLS violation' } })
    const updateEq2 = vi.fn().mockReturnValue({ select: selectFn })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFrom.mockReturnValue({ update: updateFn })

    const result = await saveDraft({ ...VALID_DRAFT_INPUT, draftId: DRAFT_ID })

    expect(result).toEqual({ success: false, error: 'Failed to update draft' })
    expect(consoleSpy).toHaveBeenCalledWith('[saveDraft] Update error:', 'RLS violation')
    consoleSpy.mockRestore()
  })

  it('returns failure when update affects zero rows (draft already deleted)', async () => {
    setupAuthenticatedUser()

    const selectFn = vi.fn().mockReturnValue({ data: [], error: null })
    const updateEq2 = vi.fn().mockReturnValue({ select: selectFn })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })

    mockFrom.mockReturnValue({ update: updateFn })

    const result = await saveDraft({ ...VALID_DRAFT_INPUT, draftId: DRAFT_ID })

    expect(result).toEqual({ success: false, error: 'Draft not found or already deleted' })
  })

  it('does not enforce the 20-draft limit when updating an existing draft', async () => {
    setupAuthenticatedUser()

    const selectFn = vi.fn().mockReturnValue({ data: [{ id: DRAFT_ID }], error: null })
    const updateEq2 = vi.fn().mockReturnValue({ select: selectFn })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })

    mockFrom.mockReturnValue({ update: updateFn })

    const result = await saveDraft({ ...VALID_DRAFT_INPUT, draftId: DRAFT_ID })

    expect(result).toEqual({ success: true })
  })
})

// ---- deleteDraft -----------------------------------------------------------

describe('deleteDraft', () => {
  it('returns failure when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
  })

  it('returns failure when draftId is not a valid UUID', async () => {
    setupAuthenticatedUser()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await deleteDraft({ draftId: 'not-a-uuid' })
    expect(result).toEqual({ success: false })
    consoleSpy.mockRestore()
  })

  it('returns success on happy path', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    // delete().eq('id', ...) returns an object where .eq('student_id', ...) is terminal
    const secondEq = vi.fn().mockReturnValue({ error: null })
    ;(chain.eq as ReturnType<typeof vi.fn>).mockReturnValue({ eq: secondEq })
    mockFrom.mockReturnValue(chain)

    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: true })
  })

  it('returns failure when the database delete fails', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    const secondEq = vi.fn().mockReturnValue({ error: { message: 'RLS policy violation' } })
    ;(chain.eq as ReturnType<typeof vi.fn>).mockReturnValue({ eq: secondEq })
    mockFrom.mockReturnValue(chain)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
    expect(consoleSpy).toHaveBeenCalledWith('[deleteDraft] Delete error:', 'RLS policy violation')
    consoleSpy.mockRestore()
  })

  it('returns failure when an unexpected error occurs', async () => {
    setupAuthenticatedUser()
    mockFrom.mockImplementation(() => {
      throw new Error('connection lost')
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteDraft({ draftId: DRAFT_ID })
    expect(result).toEqual({ success: false })
    consoleSpy.mockRestore()
  })

  it('scopes deletion to the authenticated user via student_id filter', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    const secondEq = vi.fn().mockReturnValue({ error: null })
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq })
    ;(chain.eq as ReturnType<typeof vi.fn>).mockImplementation(firstEq)
    mockFrom.mockReturnValue(chain)

    await deleteDraft({ draftId: DRAFT_ID })

    // First eq filters by 'id', second eq must filter by 'student_id'
    expect(firstEq).toHaveBeenCalledWith('id', DRAFT_ID)
    expect(secondEq).toHaveBeenCalledWith('student_id', USER_ID)
  })
})
