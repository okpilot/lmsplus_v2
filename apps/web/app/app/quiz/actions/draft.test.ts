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

import { deleteDraft, loadDraft, saveDraft } from './draft'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-0000-0000-000000000001'
const ORG_ID = '00000000-0000-0000-0000-000000000099'
const SESSION_ID = '00000000-0000-0000-0000-000000000002'
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
  id: 'draft-1',
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
    upsert: vi.fn().mockReturnValue({ error: null, ...overrides }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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
    const chain = mockChain()
    ;(chain.single as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await saveDraft(VALID_DRAFT_INPUT)
    expect(result).toEqual({ success: false, error: 'User organization not found' })
  })

  it('returns success on happy path', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    ;(chain.upsert as ReturnType<typeof vi.fn>).mockReturnValue({ error: null })
    mockFrom.mockReturnValue(chain)

    const result = await saveDraft(VALID_DRAFT_INPUT)
    expect(result).toEqual({ success: true })
  })

  it('returns failure when upsert errors', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    ;(chain.upsert as ReturnType<typeof vi.fn>).mockReturnValue({
      error: { message: 'constraint violation' },
    })
    mockFrom.mockReturnValue(chain)
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
})

// ---- loadDraft -------------------------------------------------------------

describe('loadDraft', () => {
  it('returns null draft when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await loadDraft()
    expect(result).toEqual({ draft: null })
  })

  it('returns null draft when no draft exists', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    ;(chain.maybeSingle as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await loadDraft()
    expect(result).toEqual({ draft: null })
  })

  it('returns draft data on happy path', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    mockFrom.mockReturnValue(chain)

    const result = await loadDraft()
    expect(result.draft).toEqual({
      id: 'draft-1',
      sessionId: SESSION_ID,
      questionIds: [Q1_ID, Q2_ID],
      answers: { [Q1_ID]: { selectedOptionId: 'opt-a', responseTimeMs: 2000 } },
      currentIndex: 1,
    })
  })

  it('returns null draft when query errors', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    ;(chain.maybeSingle as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      error: { message: 'db error' },
    })
    mockFrom.mockReturnValue(chain)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await loadDraft()
    expect(result).toEqual({ draft: null })
    consoleSpy.mockRestore()
  })
})

// ---- deleteDraft -----------------------------------------------------------

describe('deleteDraft', () => {
  it('returns failure when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await deleteDraft()
    expect(result).toEqual({ success: false })
  })

  it('returns success on happy path', async () => {
    setupAuthenticatedUser()
    const chain = mockChain()
    mockFrom.mockReturnValue(chain)

    const result = await deleteDraft()
    expect(result).toEqual({ success: true })
  })

  it('returns failure when an unexpected error occurs', async () => {
    setupAuthenticatedUser()
    mockFrom.mockImplementation(() => {
      throw new Error('connection lost')
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteDraft()
    expect(result).toEqual({ success: false })
    consoleSpy.mockRestore()
  })
})
