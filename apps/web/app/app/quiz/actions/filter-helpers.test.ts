import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionFilterRef, QuestionIdRow, UntypedClient } from './filter-helpers'

// ---- Helpers ----------------------------------------------------------------

/**
 * Minimal Supabase-like client that resolves to a fixed response.
 * Supports .from().select().eq().is().in() chains.
 */
function makeClient(
  tableResponses: Record<
    string,
    { data: QuestionFilterRef[] | null; error: { message: string } | null }
  >,
) {
  return {
    from(table: string) {
      const resp = tableResponses[table] ?? { data: [], error: null }
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        in: () => Promise.resolve(resp),
      }
      return { select: () => chain }
    },
  }
}

// ---- Subject under test ----------------------------------------------------

import { applyFilters } from './filter-helpers'

// ---- Fixtures ---------------------------------------------------------------

const USER_ID = 'user-1'
const Q: QuestionIdRow[] = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]

beforeEach(() => {
  vi.restoreAllMocks()
})

// ---- applyFilters — single filters ------------------------------------------

describe('applyFilters — unseen filter', () => {
  it('returns questions not yet answered by the student', async () => {
    const supabase = makeClient({
      student_responses: { data: [{ question_id: 'q1' }], error: null },
    })

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['unseen'],
    })

    expect(result.map((q) => q.id)).toEqual(['q2', 'q3'])
  })

  it('returns all questions when no answers exist for the student', async () => {
    const supabase = makeClient({
      student_responses: { data: [], error: null },
    })

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['unseen'],
    })

    expect(result).toHaveLength(3)
  })

  it('returns empty array when all questions have been answered', async () => {
    const supabase = makeClient({
      student_responses: {
        data: [{ question_id: 'q1' }, { question_id: 'q2' }, { question_id: 'q3' }],
        error: null,
      },
    })

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['unseen'],
    })

    expect(result).toHaveLength(0)
  })

  it('returns empty array and logs error when query fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeClient({
      student_responses: { data: null, error: { message: 'connection refused' } },
    })

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['unseen'],
    })

    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[applyFilters] student_responses query error:',
      'connection refused',
    )
  })
})

describe('applyFilters — incorrect filter', () => {
  it('returns questions the student last answered incorrectly', async () => {
    const supabase = makeClient({
      fsrs_cards: { data: [{ question_id: 'q1' }, { question_id: 'q3' }], error: null },
    })

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['incorrect'],
    })

    expect(result.map((q) => q.id)).toEqual(['q1', 'q3'])
  })

  it('returns empty array when no incorrect cards exist for the student', async () => {
    const supabase = makeClient({
      fsrs_cards: { data: [], error: null },
    })

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['incorrect'],
    })

    expect(result).toHaveLength(0)
  })

  it('returns empty array and logs error when query fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeClient({
      fsrs_cards: { data: null, error: { message: 'fsrs timeout' } },
    })

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['incorrect'],
    })

    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[applyFilters] fsrs_cards query error:',
      'fsrs timeout',
    )
  })
})

describe('applyFilters — flagged filter', () => {
  it('returns questions flagged by the student', async () => {
    const supabase = makeClient({
      active_flagged_questions: { data: [{ question_id: 'q2' }], error: null },
    }) as unknown as UntypedClient

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['flagged'],
    })

    expect(result.map((q) => q.id)).toEqual(['q2'])
  })

  it('returns empty array when no flagged questions exist', async () => {
    const supabase = makeClient({
      active_flagged_questions: { data: [], error: null },
    }) as unknown as UntypedClient

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['flagged'],
    })

    expect(result).toHaveLength(0)
  })

  it('returns empty array and logs error when query fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeClient({
      active_flagged_questions: { data: null, error: { message: 'rls policy blocked' } },
    }) as unknown as UntypedClient

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['flagged'],
    })

    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[applyFilters] active_flagged_questions query error:',
      'rls policy blocked',
    )
  })
})

// ---- applyFilters — multiple filters (intersection) -------------------------

describe('applyFilters — multiple filters produce intersection', () => {
  it('returns all matching questions when exactly one filter is active', async () => {
    // With a single filter, idSets.slice(1) is empty — the reduce returns idSets[0]
    // directly (the initial accumulator). This is the boundary case the reduce fix enables.
    const supabase = makeClient({
      fsrs_cards: { data: [{ question_id: 'q2' }], error: null },
    })

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['incorrect'],
    })

    expect(result.map((q) => q.id)).toEqual(['q2'])
  })

  it('returns only questions matching ALL active filters', async () => {
    // q1 is unseen (not in student_responses) AND incorrect (in fsrs_cards)
    // q2 is unseen but not incorrect
    // q3 has been seen (in student_responses) but is incorrect
    // Expected intersection: q1 only
    const supabase = makeClient({
      student_responses: { data: [{ question_id: 'q3' }], error: null },
      fsrs_cards: { data: [{ question_id: 'q1' }, { question_id: 'q3' }], error: null },
    })

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['unseen', 'incorrect'],
    })

    expect(result.map((q) => q.id)).toEqual(['q1'])
  })
})

// ---- applyFilters — unknown filter falls through ---------------------------

describe('applyFilters — unknown filter value', () => {
  it('returns all questions for an unrecognised filter string', async () => {
    // The source code returns `questions` for any unrecognised filter
    const supabase = makeClient({})

    const result = await applyFilters({
      supabase: supabase as unknown as Parameters<typeof applyFilters>[0]['supabase'],
      userId: USER_ID,
      questions: Q,
      filters: ['unknown-filter'],
    })

    expect(result).toHaveLength(3)
  })
})
