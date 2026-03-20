import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionWithGroup } from './lookup-helpers'
import { buildQuestionQuery, groupCounts } from './lookup-helpers'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const TOPIC_A = '00000000-0000-4000-b000-000000000001'
const TOPIC_B = '00000000-0000-4000-b000-000000000002'
const SUBTOPIC_A = '00000000-0000-4000-c000-000000000001'
const SUBTOPIC_B = '00000000-0000-4000-c000-000000000002'

const Q1: QuestionWithGroup = { id: 'q1', topic_id: TOPIC_A, subtopic_id: SUBTOPIC_A }
const Q2: QuestionWithGroup = { id: 'q2', topic_id: TOPIC_A, subtopic_id: null }
const Q3: QuestionWithGroup = { id: 'q3', topic_id: TOPIC_B, subtopic_id: SUBTOPIC_B }

// ---- Helpers --------------------------------------------------------------

/**
 * Build a chainable Supabase from() mock.
 * The chain is thenable — awaiting it resolves to `{ data, error }`.
 */
function buildQueryChain(terminalData: unknown[], terminalError: unknown = null) {
  const terminal = { data: terminalData, error: terminalError }
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable — mock must implement .then() to be awaitable
    then: vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolve(terminal))),
  }
  return chain
}

function buildSupabaseMock(chain: Record<string, unknown>) {
  return { from: vi.fn(() => chain) } as unknown as Parameters<typeof buildQuestionQuery>[0]
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- buildQuestionQuery ---------------------------------------------------

describe('buildQuestionQuery — base query', () => {
  it('queries active, non-deleted questions for the given subject', async () => {
    const chain = buildQueryChain([Q1, Q2])
    const supabase = buildSupabaseMock(chain)

    const { data, error } = await buildQuestionQuery(supabase, SUBJECT_ID)

    expect(supabase.from).toHaveBeenCalledWith('questions')
    expect(chain.select).toHaveBeenCalledWith('id, topic_id, subtopic_id')
    expect(chain.eq).toHaveBeenCalledWith('status', 'active')
    expect(chain.eq).toHaveBeenCalledWith('subject_id', SUBJECT_ID)
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(data).toEqual([Q1, Q2])
    expect(error).toBeNull()
  })

  it('returns empty array when query returns null data', async () => {
    const terminal = { data: null, error: null }
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable
      then: vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolve(terminal))),
    }
    const supabase = buildSupabaseMock(chain)

    const { data } = await buildQuestionQuery(supabase, SUBJECT_ID)
    expect(data).toEqual([])
  })

  it('returns error when query fails', async () => {
    const chain = buildQueryChain([], { message: 'DB error' })
    const supabase = buildSupabaseMock(chain)

    const { data, error } = await buildQuestionQuery(supabase, SUBJECT_ID)
    expect(data).toEqual([])
    expect(error).toEqual({ message: 'DB error' })
  })
})

describe('buildQuestionQuery — topic/subtopic filtering', () => {
  it('applies OR filter when both topicIds and subtopicIds are provided', async () => {
    const chain = buildQueryChain([Q1])
    const supabase = buildSupabaseMock(chain)

    await buildQuestionQuery(supabase, SUBJECT_ID, [TOPIC_A], [SUBTOPIC_A])

    expect(chain.or).toHaveBeenCalledWith(`topic_id.in.(${TOPIC_A}),subtopic_id.in.(${SUBTOPIC_A})`)
    expect(chain.in).not.toHaveBeenCalled()
  })

  it('applies topic-only filter when only topicIds are provided', async () => {
    const chain = buildQueryChain([Q1, Q2])
    const supabase = buildSupabaseMock(chain)

    await buildQuestionQuery(supabase, SUBJECT_ID, [TOPIC_A, TOPIC_B], undefined)

    expect(chain.in).toHaveBeenCalledWith('topic_id', [TOPIC_A, TOPIC_B])
    expect(chain.or).not.toHaveBeenCalled()
  })

  it('applies subtopic-only filter when only subtopicIds are provided', async () => {
    const chain = buildQueryChain([Q3])
    const supabase = buildSupabaseMock(chain)

    await buildQuestionQuery(supabase, SUBJECT_ID, undefined, [SUBTOPIC_B])

    expect(chain.in).toHaveBeenCalledWith('subtopic_id', [SUBTOPIC_B])
    expect(chain.or).not.toHaveBeenCalled()
  })

  it('applies no topic/subtopic filter when neither is provided', async () => {
    const chain = buildQueryChain([Q1, Q2, Q3])
    const supabase = buildSupabaseMock(chain)

    await buildQuestionQuery(supabase, SUBJECT_ID)

    expect(chain.or).not.toHaveBeenCalled()
    expect(chain.in).not.toHaveBeenCalled()
  })

  it('applies no topic/subtopic filter when both are empty arrays', async () => {
    const chain = buildQueryChain([])
    const supabase = buildSupabaseMock(chain)

    await buildQuestionQuery(supabase, SUBJECT_ID, [], [])

    expect(chain.or).not.toHaveBeenCalled()
    expect(chain.in).not.toHaveBeenCalled()
  })
})

// ---- groupCounts ----------------------------------------------------------

describe('groupCounts', () => {
  it('groups counts by topic_id', () => {
    const result = groupCounts([Q1, Q2, Q3])
    expect(result.byTopic).toEqual({
      [TOPIC_A]: 2,
      [TOPIC_B]: 1,
    })
  })

  it('groups counts by subtopic_id, ignoring nulls', () => {
    const result = groupCounts([Q1, Q2, Q3])
    expect(result.bySubtopic).toEqual({
      [SUBTOPIC_A]: 1,
      [SUBTOPIC_B]: 1,
    })
    // Q2 has subtopic_id: null — should not appear
    expect(result.bySubtopic).not.toHaveProperty('null')
  })

  it('returns empty objects for empty input', () => {
    const result = groupCounts([])
    expect(result.byTopic).toEqual({})
    expect(result.bySubtopic).toEqual({})
  })

  it('counts multiple questions in the same subtopic', () => {
    const q4: QuestionWithGroup = { id: 'q4', topic_id: TOPIC_A, subtopic_id: SUBTOPIC_A }
    const result = groupCounts([Q1, q4])
    expect(result.bySubtopic[SUBTOPIC_A]).toBe(2)
  })
})
