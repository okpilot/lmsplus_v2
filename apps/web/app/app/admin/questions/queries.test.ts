import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockFrom = vi.hoisted(() => vi.fn())
const mockCreateServerSupabaseClient = vi.hoisted(() => vi.fn())

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}))

// ---- Subject under test ---------------------------------------------------

import { getQuestionsList, PAGE_SIZE } from './queries'

// ---- Helpers ---------------------------------------------------------------

/**
 * Builds a fully chainable mock query that resolves with { data, count, error: null }
 * when awaited. Every Supabase query builder method returns `this`, so all
 * chained calls (select, is, order, range, eq, ilike) return the same object.
 */
function makeQueryChain(data: unknown[], count = data.length) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.is = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.range = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.ilike = vi.fn().mockReturnValue(chain)
  // Make the chain thenable so `await query` resolves correctly
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock for Supabase query builder
  chain.then = vi
    .fn()
    .mockImplementation(
      (resolve: (value: { data: unknown[]; count: number; error: null }) => void) => {
        resolve({ data, count, error: null })
        return Promise.resolve({ data, count, error: null })
      },
    )
  return chain
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q1',
    question_number: 'MET-001',
    question_text: 'What is QNH?',
    difficulty: 'easy',
    status: 'active',
    subject_id: 's1',
    topic_id: 't1',
    subtopic_id: 'st1',
    options: [],
    explanation_text: 'QNH is...',
    question_image_url: null,
    explanation_image_url: null,
    lo_reference: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    easa_subjects: { code: '050', name: 'Meteorology' },
    easa_topics: { name: 'Pressure' },
    easa_subtopics: { name: 'Altimeter Settings' },
    ...overrides,
  }
}

function mockSupabaseWith(data: unknown[], count = data.length) {
  const chain = makeQueryChain(data, count)
  mockFrom.mockReturnValue(chain)
  mockCreateServerSupabaseClient.mockResolvedValue({ from: mockFrom })
  return chain
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getQuestionsList', () => {
  it('returns ok with empty questions and totalCount 0 when DB returns no rows', async () => {
    mockSupabaseWith([], 0)

    const result = await getQuestionsList({})

    expect(result).toEqual({ ok: true, questions: [], totalCount: 0 })
  })

  it('maps easa_subjects, easa_topics, easa_subtopics to subject, topic, subtopic', async () => {
    const row = makeRow()
    mockSupabaseWith([row], 1)

    const result = await getQuestionsList({})

    if (!result.ok) throw new Error('Expected ok result')
    expect(result.questions).toHaveLength(1)
    const item = result.questions[0]!
    expect(item.subject).toEqual({ code: '050', name: 'Meteorology' })
    expect(item.topic).toEqual({ name: 'Pressure' })
    expect(item.subtopic).toEqual({ name: 'Altimeter Settings' })
  })

  it('maps null join relations to null on subject, topic, subtopic', async () => {
    const row = makeRow({
      easa_subjects: null,
      easa_topics: null,
      easa_subtopics: null,
    })
    mockSupabaseWith([row], 1)

    const result = await getQuestionsList({})

    if (!result.ok) throw new Error('Expected ok result')
    const item = result.questions[0]!
    expect(item.subject).toBeNull()
    expect(item.topic).toBeNull()
    expect(item.subtopic).toBeNull()
  })

  it('returns ok with empty questions when data is null (RLS filters all rows)', async () => {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.is = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.range = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.ilike = vi.fn().mockReturnValue(chain)
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock for Supabase query builder
    chain.then = vi
      .fn()
      .mockImplementation(
        (resolve: (value: { data: null; count: number; error: null }) => void) => {
          resolve({ data: null, count: 0, error: null })
          return Promise.resolve({ data: null, count: 0, error: null })
        },
      )
    mockFrom.mockReturnValue(chain)
    mockCreateServerSupabaseClient.mockResolvedValue({ from: mockFrom })

    const result = await getQuestionsList({})

    expect(result).toEqual({ ok: true, questions: [], totalCount: 0 })
  })

  it('applies subjectId filter when provided', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({ subjectId: 's1' })

    expect(chain.eq).toHaveBeenCalledWith('subject_id', 's1')
  })

  it('does not apply subjectId filter when omitted', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({})

    const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls
    const subjectEqCall = eqCalls.find((args: unknown[]) => args[0] === 'subject_id')
    expect(subjectEqCall).toBeUndefined()
  })

  it('applies topicId filter when provided', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({ topicId: 't1' })

    expect(chain.eq).toHaveBeenCalledWith('topic_id', 't1')
  })

  it('applies subtopicId filter when provided', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({ subtopicId: 'st1' })

    expect(chain.eq).toHaveBeenCalledWith('subtopic_id', 'st1')
  })

  it('applies difficulty filter when provided', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({ difficulty: 'hard' })

    expect(chain.eq).toHaveBeenCalledWith('difficulty', 'hard')
  })

  it('applies status filter when provided', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({ status: 'draft' })

    expect(chain.eq).toHaveBeenCalledWith('status', 'draft')
  })

  it('applies search filter as ilike with wildcard wrapping when provided', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({ search: 'QNH' })

    expect(chain.ilike).toHaveBeenCalledWith('question_text', '%QNH%')
  })

  it('escapes LIKE wildcards in search input', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({ search: '100%_pass' })

    expect(chain.ilike).toHaveBeenCalledWith('question_text', '%100\\%\\_pass%')
  })

  it('does not apply ilike filter when search is omitted', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({})

    expect(chain.ilike).not.toHaveBeenCalled()
  })

  it('applies all filters together when all are provided', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({
      subjectId: 's1',
      topicId: 't1',
      subtopicId: 'st1',
      difficulty: 'medium',
      status: 'active',
      search: 'cloud',
    })

    expect(chain.eq).toHaveBeenCalledWith('subject_id', 's1')
    expect(chain.eq).toHaveBeenCalledWith('topic_id', 't1')
    expect(chain.eq).toHaveBeenCalledWith('subtopic_id', 'st1')
    expect(chain.eq).toHaveBeenCalledWith('difficulty', 'medium')
    expect(chain.eq).toHaveBeenCalledWith('status', 'active')
    expect(chain.ilike).toHaveBeenCalledWith('question_text', '%cloud%')
  })

  it('always queries with deleted_at IS NULL to exclude soft-deleted rows', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({})

    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('always orders results by created_at descending', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({})

    expect(chain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    })
  })

  it('passes count exact option to select', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({})

    expect(chain.select).toHaveBeenCalledWith(expect.any(String), { count: 'exact' })
  })

  it('uses range for page 1 with correct offsets', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({})

    expect(chain.range).toHaveBeenCalledWith(0, PAGE_SIZE - 1)
  })

  it('uses range for page 2 with correct offsets', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({ page: 2 })

    expect(chain.range).toHaveBeenCalledWith(PAGE_SIZE, PAGE_SIZE * 2 - 1)
  })

  it('uses range for page 3 with correct offsets', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({ page: 3 })

    expect(chain.range).toHaveBeenCalledWith(PAGE_SIZE * 2, PAGE_SIZE * 3 - 1)
  })

  it('defaults to page 1 when page is not provided', async () => {
    const chain = mockSupabaseWith([])

    await getQuestionsList({})

    expect(chain.range).toHaveBeenCalledWith(0, PAGE_SIZE - 1)
  })

  it('returns totalCount from Supabase count', async () => {
    const rows = [makeRow({ id: 'q1' }), makeRow({ id: 'q2' })]
    mockSupabaseWith(rows, 150)

    const result = await getQuestionsList({})

    if (!result.ok) throw new Error('Expected ok result')
    expect(result.totalCount).toBe(150)
    expect(result.questions).toHaveLength(2)
  })

  it('returns totalCount 0 when count is null', async () => {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.is = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.range = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.ilike = vi.fn().mockReturnValue(chain)
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock for Supabase query builder
    chain.then = vi
      .fn()
      .mockImplementation(
        (resolve: (value: { data: unknown[]; count: null; error: null }) => void) => {
          resolve({ data: [], count: null, error: null })
          return Promise.resolve({ data: [], count: null, error: null })
        },
      )
    mockFrom.mockReturnValue(chain)
    mockCreateServerSupabaseClient.mockResolvedValue({ from: mockFrom })

    const result = await getQuestionsList({})

    if (!result.ok) throw new Error('Expected ok result')
    expect(result.totalCount).toBe(0)
  })

  it('returns multiple rows with correctly mapped relations', async () => {
    const rows = [
      makeRow({ id: 'q1', question_text: 'First question' }),
      makeRow({
        id: 'q2',
        question_text: 'Second question',
        easa_subtopics: null,
        subtopic_id: null,
      }),
    ]
    mockSupabaseWith(rows, 2)

    const result = await getQuestionsList({})

    if (!result.ok) throw new Error('Expected ok result')
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0]!.id).toBe('q1')
    expect(result.questions[1]!.id).toBe('q2')
    expect(result.questions[1]!.subtopic).toBeNull()
  })

  it('returns ok false with error message when query fails', async () => {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.is = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.range = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.ilike = vi.fn().mockReturnValue(chain)
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock for Supabase query builder
    chain.then = vi
      .fn()
      .mockImplementation(
        (resolve: (value: { data: null; count: null; error: { message: string } }) => void) => {
          resolve({ data: null, count: null, error: { message: 'connection refused' } })
          return Promise.resolve({
            data: null,
            count: null,
            error: { message: 'connection refused' },
          })
        },
      )
    mockFrom.mockReturnValue(chain)
    mockCreateServerSupabaseClient.mockResolvedValue({ from: mockFrom })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getQuestionsList({})

    expect(result).toEqual({ ok: false, error: 'Failed to load questions' })
    expect(consoleSpy).toHaveBeenCalledWith('[getQuestionsList] query error:', 'connection refused')
    consoleSpy.mockRestore()
  })
})
