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

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const ORG_ID = '00000000-0000-4000-a000-000000000099'
const SESSION_ID = '00000000-0000-4000-a000-000000000002'
const DRAFT_ID = '00000000-0000-4000-a000-000000000050'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'

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

  it('returns failure when authentication fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })
    const result = await saveDraft(VALID_DRAFT_INPUT)
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns failure when input fails validation', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({ sessionId: 'not-a-uuid' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('returns failure when organization_id is not found', async () => {
    setupAuthenticatedUser()
    const chain = mockChainWithCount(0)
    ;(chain.single as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await saveDraft(VALID_DRAFT_INPUT)
    expect(result).toEqual({ success: false, error: 'User organization not found' })
  })

  it('returns failure when the users query errors', async () => {
    setupAuthenticatedUser()
    const chain = mockChainWithCount(0)
    ;(chain.single as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      error: { message: 'row-level security policy violation' },
    })
    mockFrom.mockReturnValue(chain)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await saveDraft(VALID_DRAFT_INPUT)

    expect(result).toEqual({ success: false, error: 'Failed to look up user' })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[saveDraft] Users query error:',
      'row-level security policy violation',
    )
    consoleSpy.mockRestore()
  })

  it('returns failure when draft limit of 20 is reached', async () => {
    setupAuthenticatedUser()
    // First call: users table for orgId; second call: count query returns 20
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
    expect(consoleSpy).toHaveBeenCalledWith('[saveDraft] Insert error:', 'db error')
    consoleSpy.mockRestore()
  })

  it('returns generic failure when the insert helper throws an unexpected error', async () => {
    setupAuthenticatedUser()
    // First from() call succeeds (users org lookup), second throws
    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) return mockChain() // users org lookup — succeeds
      throw new Error('connection reset')
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await saveDraft(VALID_DRAFT_INPUT)

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
    expect(consoleSpy).toHaveBeenCalledWith('[saveDraft] Uncaught error:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('logs error when draft count query fails', async () => {
    setupAuthenticatedUser()
    let callIndex = 0
    mockFrom.mockImplementation(() => {
      callIndex++
      if (callIndex === 1) return mockChain() // users org lookup
      // count query returns error
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ count: null, error: { message: 'count failed' } }),
        }),
      }
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await saveDraft(VALID_DRAFT_INPUT)

    expect(result).toEqual({ success: false, error: 'Failed to save draft' })
    expect(consoleSpy).toHaveBeenCalledWith('[saveDraft] Draft count query error:', 'count failed')
    consoleSpy.mockRestore()
  })

  it('validates that questionIds must be UUIDs', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      questionIds: ['not-a-uuid'],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('rejects a draft whose selectedOptionId is whitespace-only', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: { [Q1_ID]: { selectedOptionId: '   ', responseTimeMs: 2000 } },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('validates that answers have non-negative responseTimeMs', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: { [Q1_ID]: { selectedOptionId: 'a', responseTimeMs: -1 } },
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(typeof result.error).toBe('string')
  })

  it('returns failure when currentIndex equals questionIds.length (out of range)', async () => {
    setupAuthenticatedUser()

    // questionIds has 2 items (indices 0-1), currentIndex 2 is out of range
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      currentIndex: 2,
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns failure when currentIndex exceeds questionIds.length', async () => {
    setupAuthenticatedUser()

    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      currentIndex: 99,
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('accepts a valid feedback record and passes it through to the insert row', async () => {
    setupAuthenticatedUser()
    let capturedInsertArg: Record<string, unknown> | undefined
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
      return {
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          capturedInsertArg = row
          return { error: null }
        }),
      }
    })

    const feedbackPayload = {
      [Q1_ID]: {
        questionType: 'multiple_choice',
        isCorrect: true,
        correctOptionId: 'opt-a',
        explanationText: 'Lift equals weight in level flight.',
        explanationImageUrl: null,
      },
    }

    const result = await saveDraft({ ...VALID_DRAFT_INPUT, feedback: feedbackPayload })

    expect(result).toEqual({ success: true })
    expect(capturedInsertArg).toBeDefined()
    expect(capturedInsertArg!.feedback).toEqual(feedbackPayload)
  })

  it('persists short_answer and dialog_fill answers + feedback on save', async () => {
    setupAuthenticatedUser()
    let capturedInsertArg: Record<string, unknown> | undefined
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
      return {
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          capturedInsertArg = row
          return { error: null }
        }),
      }
    })

    const answers = {
      [Q1_ID]: { responseText: 'cleared to land', responseTimeMs: 2000 },
      [Q2_ID]: {
        blankAnswers: [{ index: 0, text: 'cleared' }],
        responseTimeMs: 3000,
      },
    }
    const feedbackPayload = {
      [Q1_ID]: {
        questionType: 'short_answer',
        isCorrect: true,
        correctAnswer: 'cleared to land',
        explanationText: null,
        explanationImageUrl: null,
      },
      [Q2_ID]: {
        questionType: 'dialog_fill',
        isCorrect: false,
        blanks: [{ index: 0, isCorrect: true, canonical: 'cleared' }],
        explanationText: null,
        explanationImageUrl: null,
      },
    }

    const result = await saveDraft({ ...VALID_DRAFT_INPUT, answers, feedback: feedbackPayload })

    expect(result).toEqual({ success: true })
    expect(capturedInsertArg!.answers).toEqual(answers)
    expect(capturedInsertArg!.feedback).toEqual(feedbackPayload)
  })

  it('persists an ordering answer + feedback on save', async () => {
    setupAuthenticatedUser()
    let capturedInsertArg: Record<string, unknown> | undefined
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
      return {
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          capturedInsertArg = row
          return { error: null }
        }),
      }
    })

    const answers = {
      [Q1_ID]: { order: ['item-c', 'item-a', 'item-b'], responseTimeMs: 4000 },
    }
    const feedbackPayload = {
      [Q1_ID]: {
        questionType: 'ordering',
        isCorrect: false,
        correctOrder: ['MAYDAY', 'callsign', 'distress'],
        explanationText: null,
        explanationImageUrl: null,
      },
    }

    const result = await saveDraft({ ...VALID_DRAFT_INPUT, answers, feedback: feedbackPayload })

    expect(result).toEqual({ success: true })
    expect(capturedInsertArg!.answers).toEqual(answers)
    expect(capturedInsertArg!.feedback).toEqual(feedbackPayload)
  })

  it('rejects an ordering answer carrying fewer than two items', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: { [Q1_ID]: { order: ['item-a'], responseTimeMs: 4000 } },
    })
    // Assert the exact validation-rejection shape (matches the neighboring cases) —
    // a bare success:false also passes on auth/lookup failures, so it wouldn't catch
    // a regression where ordering validation stops being the rejection path.
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects an ordering answer with duplicate item ids', async () => {
    // The .refine() on SaveDraftInput.answers.order enforces unique ids —
    // a permutation cannot repeat the same item (CR finding #3).
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: { order: ['item-a', 'item-b', 'item-a'], responseTimeMs: 4000 },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('accepts a valid ordering answer whose ids are all unique', async () => {
    // Positive control for the duplicate-id .refine() guard.
    setupAuthenticatedUser()
    let capturedInsertArg: Record<string, unknown> | undefined
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
      return {
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          capturedInsertArg = row
          return { error: null }
        }),
      }
    })
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: { order: ['item-c', 'item-a', 'item-b'], responseTimeMs: 4000 },
      },
    })
    expect(result).toEqual({ success: true })
    expect((capturedInsertArg!.answers as Record<string, unknown>)[Q1_ID]).toMatchObject({
      order: ['item-c', 'item-a', 'item-b'],
    })
  })

  it('rejects an ordering answer with more than 50 items', async () => {
    // Mirrors the answers.blankAnswers .max(50) cap — parity for ordering.
    setupAuthenticatedUser()
    const order = Array.from({ length: 51 }, (_, i) => `item-${i}`)
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: { [Q1_ID]: { order, responseTimeMs: 4000 } },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects an ordering answer whose order contains a whitespace-only item id', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: { [Q1_ID]: { order: ['item-a', '   '], responseTimeMs: 4000 } },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects an ordering answer containing an item id longer than 200 characters', async () => {
    // Mirrors the answers.blankAnswers text .max(200) cap — parity for ordering item ids.
    setupAuthenticatedUser()
    const longId = 'a'.repeat(201)
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: { [Q1_ID]: { order: ['item-a', longId], responseTimeMs: 4000 } },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects an ordering feedback entry whose correctOrder has fewer than two items', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          questionType: 'ordering',
          isCorrect: true,
          correctOrder: ['MAYDAY'],
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    // Assert the exact validation-rejection shape (matches the neighboring cases) —
    // a bare success:false also passes on auth/lookup failures, so it wouldn't catch
    // a regression where ordering-feedback validation stops being the rejection path.
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects an ordering feedback entry whose correctOrder exceeds 50 items', async () => {
    // Parity with "rejects an ordering answer with more than 50 items" — schema comment
    // documents .max(50) as mirroring the sibling blanks-feedback cap.
    setupAuthenticatedUser()
    const correctOrder = Array.from({ length: 51 }, (_, i) => `item-${i}`)
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          questionType: 'ordering',
          isCorrect: true,
          correctOrder,
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects an ordering feedback entry whose correctOrder contains a whitespace-only id', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          questionType: 'ordering',
          isCorrect: true,
          correctOrder: ['MAYDAY', '   '],
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects an ordering feedback entry with duplicate ids in correctOrder', async () => {
    // Parity with "rejects an ordering answer with duplicate item ids" — schema comment:
    // "A canonical order is a permutation — duplicate ids mean corrupt feedback."
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          questionType: 'ordering',
          isCorrect: false,
          correctOrder: ['MAYDAY', 'callsign', 'MAYDAY'],
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('persists a diagram_label answer + feedback on save', async () => {
    setupAuthenticatedUser()
    let capturedInsertArg: Record<string, unknown> | undefined
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
      return {
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          capturedInsertArg = row
          return { error: null }
        }),
      }
    })

    const answers = {
      [Q1_ID]: {
        mapping: [
          { zoneId: 'z1', labelId: 'l1' },
          { zoneId: 'z2', labelId: 'l2' },
        ],
        responseTimeMs: 4000,
      },
    }
    const feedbackPayload = {
      [Q1_ID]: {
        questionType: 'diagram_label',
        isCorrect: false,
        correctMapping: [
          { zoneId: 'z1', labelId: 'l1' },
          { zoneId: 'z2', labelId: 'l3' },
        ],
        explanationText: null,
        explanationImageUrl: null,
      },
    }

    const result = await saveDraft({ ...VALID_DRAFT_INPUT, answers, feedback: feedbackPayload })

    expect(result).toEqual({ success: true })
    expect(capturedInsertArg!.answers).toEqual(answers)
    expect(capturedInsertArg!.feedback).toEqual(feedbackPayload)
  })

  it('rejects a diagram_label answer whose mapping is empty', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: { [Q1_ID]: { mapping: [], responseTimeMs: 4000 } },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a diagram_label answer whose mapping repeats a zoneId', async () => {
    // isValidDiagramMapping's array-level self-defence: a zone can only be
    // placed once — a duplicate zoneId is not a valid submitted mapping.
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: {
          mapping: [
            { zoneId: 'z1', labelId: 'l1' },
            { zoneId: 'z1', labelId: 'l2' },
          ],
          responseTimeMs: 4000,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a diagram_label answer whose mapping reuses a labelId', async () => {
    // A chip is consumed on placement — it cannot occupy two zones simultaneously.
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: {
          mapping: [
            { zoneId: 'z1', labelId: 'l1' },
            { zoneId: 'z2', labelId: 'l1' },
          ],
          responseTimeMs: 4000,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a diagram_label answer whose mapping has a whitespace-only zoneId', async () => {
    // .trim() before min/max on DiagramMappingSchema — parity with
    // isDiagramMappingEntry — a whitespace-only id must not persist in a draft.
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: {
          mapping: [{ zoneId: '   ', labelId: 'l1' }],
          responseTimeMs: 4000,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a diagram_label answer whose mapping has a whitespace-only labelId', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: {
          mapping: [{ zoneId: 'z1', labelId: '   ' }],
          responseTimeMs: 4000,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('accepts a valid partial diagram_label mapping (not every zone filled)', async () => {
    // Positive control: unlike ordering, a diagram mapping is not required to be
    // complete — partial submissions are explicitly allowed (Decision 52).
    setupAuthenticatedUser()
    let capturedInsertArg: Record<string, unknown> | undefined
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
      return {
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          capturedInsertArg = row
          return { error: null }
        }),
      }
    })
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: { [Q1_ID]: { mapping: [{ zoneId: 'z1', labelId: 'l1' }], responseTimeMs: 4000 } },
    })
    expect(result).toEqual({ success: true })
    expect((capturedInsertArg!.answers as Record<string, unknown>)[Q1_ID]).toMatchObject({
      mapping: [{ zoneId: 'z1', labelId: 'l1' }],
    })
  })

  it('rejects a diagram_label answer whose mapping exceeds MAX_ZONES', async () => {
    setupAuthenticatedUser()
    const mapping = Array.from({ length: 51 }, (_, i) => ({ zoneId: `z${i}`, labelId: `l${i}` }))
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: { [Q1_ID]: { mapping, responseTimeMs: 4000 } },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects an answer payload carrying both a mapping and an order', async () => {
    // Exactly one answer payload must be present — a hybrid diagram/ordering
    // payload is corrupt (draft-schema's five-way exclusivity .refine()).
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: {
          mapping: [{ zoneId: 'z1', labelId: 'l1' }],
          order: ['item-a', 'item-b'],
          responseTimeMs: 4000,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a diagram_label feedback entry whose correctMapping is empty', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          questionType: 'diagram_label',
          isCorrect: true,
          correctMapping: [],
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a diagram_label feedback entry with a duplicate zoneId in correctMapping', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          questionType: 'diagram_label',
          isCorrect: false,
          correctMapping: [
            { zoneId: 'z1', labelId: 'l1' },
            { zoneId: 'z1', labelId: 'l2' },
          ],
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('writes an empty feedback object when feedback is omitted', async () => {
    setupAuthenticatedUser()
    let capturedInsertArg: Record<string, unknown> | undefined
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
      return {
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          capturedInsertArg = row
          return { error: null }
        }),
      }
    })

    const result = await saveDraft(VALID_DRAFT_INPUT)

    expect(result).toEqual({ success: true })
    expect(capturedInsertArg!.feedback).toEqual({})
  })

  it('rejects a feedback entry where isCorrect is not a boolean', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          isCorrect: 'yes', // invalid — must be boolean
          correctOptionId: 'opt-a',
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(typeof result.error).toBe('string')
  })

  it('rejects answers whose keys are not present in questionIds', async () => {
    setupAuthenticatedUser()
    const staleQuestionId = '00000000-0000-4000-a000-000000000099'
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: { selectedOptionId: 'opt-a', responseTimeMs: 1000 },
        [staleQuestionId]: { selectedOptionId: 'opt-b', responseTimeMs: 500 },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('rejects feedback whose keys are not present in questionIds', async () => {
    setupAuthenticatedUser()
    const staleQuestionId = '00000000-0000-4000-a000-000000000099'
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [staleQuestionId]: {
          questionType: 'multiple_choice',
          isCorrect: true,
          correctOptionId: 'opt-a',
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('rejects a dialog_fill feedback entry whose blank index exceeds 9999', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          questionType: 'dialog_fill',
          isCorrect: false,
          blanks: [{ index: 10000, isCorrect: false, canonical: 'cleared' }],
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })

  it('rejects a dialog_fill feedback entry whose blanks array is empty', async () => {
    // C3 parity: feedback.dialog_fill.blanks .min(1) — added in the same commit that
    // added .min(1) to answers.blankAnswers; empty feedback blanks are corrupt.
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          questionType: 'dialog_fill',
          isCorrect: false,
          blanks: [],
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a dialog_fill feedback entry that carries more than 50 blanks', async () => {
    // C3: feedback.dialog_fill.blanks .max(50) — mirrors the answers.blankAnswers cap.
    setupAuthenticatedUser()
    const blanks = Array.from({ length: 51 }, (_, i) => ({
      index: i,
      isCorrect: true,
      canonical: 'x',
    }))
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          questionType: 'dialog_fill',
          isCorrect: true,
          blanks,
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a dialog_fill feedback entry whose blanks contain a repeated index', async () => {
    // C3: feedback.dialog_fill.blanks superRefine duplicate-index check — mirrors answers.blankAnswers.
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      feedback: {
        [Q1_ID]: {
          questionType: 'dialog_fill',
          isCorrect: false,
          blanks: [
            { index: 0, isCorrect: true, canonical: 'cleared' },
            { index: 0, isCorrect: false, canonical: 'runway 27' },
          ],
          explanationText: null,
          explanationImageUrl: null,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a draft whose dialog answer repeats a blank index', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: {
          blankAnswers: [
            { index: 0, text: 'cleared' },
            { index: 0, text: 'again' },
          ],
          responseTimeMs: 2000,
        },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a draft whose dialog answer carries more than 50 blanks', async () => {
    setupAuthenticatedUser()
    const blankAnswers = Array.from({ length: 51 }, (_, i) => ({ index: i, text: 'x' }))
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: { blankAnswers, responseTimeMs: 2000 },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a draft whose short answer exceeds the 500-character limit', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: { responseText: 'a'.repeat(501), responseTimeMs: 2000 },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects a draft whose dialog blank text exceeds the 200-character limit', async () => {
    setupAuthenticatedUser()
    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      answers: {
        [Q1_ID]: { blankAnswers: [{ index: 0, text: 'a'.repeat(201) }], responseTimeMs: 2000 },
      },
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
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

  it('passes feedback through to the update payload when provided', async () => {
    setupAuthenticatedUser()

    let capturedUpdateArg: Record<string, unknown> | undefined
    const selectFn = vi.fn().mockReturnValue({ data: [{ id: DRAFT_ID }], error: null })
    const updateEq2 = vi.fn().mockReturnValue({ select: selectFn })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedUpdateArg = payload
      return { eq: updateEq1 }
    })

    mockFrom.mockReturnValue({ update: updateFn })

    const feedbackPayload = {
      [Q1_ID]: {
        questionType: 'multiple_choice',
        isCorrect: false,
        correctOptionId: 'opt-b',
        explanationText: null,
        explanationImageUrl: null,
      },
    }

    const result = await saveDraft({
      ...VALID_DRAFT_INPUT,
      draftId: DRAFT_ID,
      feedback: feedbackPayload,
    })

    expect(result).toEqual({ success: true })
    expect(capturedUpdateArg!.feedback).toEqual(feedbackPayload)
  })

  it('writes an empty feedback object to the update payload when feedback is omitted', async () => {
    setupAuthenticatedUser()

    let capturedUpdateArg: Record<string, unknown> | undefined
    const selectFn = vi.fn().mockReturnValue({ data: [{ id: DRAFT_ID }], error: null })
    const updateEq2 = vi.fn().mockReturnValue({ select: selectFn })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedUpdateArg = payload
      return { eq: updateEq1 }
    })

    mockFrom.mockReturnValue({ update: updateFn })

    const result = await saveDraft({ ...VALID_DRAFT_INPUT, draftId: DRAFT_ID })

    expect(result).toEqual({ success: true })
    expect(capturedUpdateArg!.feedback).toEqual({})
  })

  it('returns generic failure when the update helper throws an unexpected error', async () => {
    setupAuthenticatedUser()

    mockFrom.mockImplementation(() => {
      throw new Error('network timeout')
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await saveDraft({ ...VALID_DRAFT_INPUT, draftId: DRAFT_ID })

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
    expect(consoleSpy).toHaveBeenCalledWith('[saveDraft] Uncaught error:', expect.any(Error))
    consoleSpy.mockRestore()
  })
})
