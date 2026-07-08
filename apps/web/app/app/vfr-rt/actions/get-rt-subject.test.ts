import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'

// ---- Mocks ----------------------------------------------------------------

const { mockFrom, mockGetTopicsWithSubtopics } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetTopicsWithSubtopics: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom }),
}))

vi.mock('@/lib/queries/quiz-subject-queries', () => ({
  getTopicsWithSubtopics: (...args: unknown[]) => mockGetTopicsWithSubtopics(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { getRtSubjectData } from './get-rt-subject'

// ---- Helpers --------------------------------------------------------------

/** Builds a fluent Supabase query-chain stub that resolves to `returnValue`. */
function buildChain(returnValue: unknown) {
  const awaitable: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'

const TOPIC: TopicWithSubtopics = {
  id: 't-1',
  code: 'P1',
  name: 'Topic 1',
  questionCount: 5,
  subtopics: [],
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockGetTopicsWithSubtopics.mockResolvedValue([TOPIC])
})

// ---- Happy path -----------------------------------------------------------

describe('getRtSubjectData — happy path', () => {
  it('returns the subject id when the lookup succeeds', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))

    const result = await getRtSubjectData()

    expect(result.id).toBe(SUBJECT_ID)
  })

  it('queries the easa_subjects table for the RT subject code', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))

    await getRtSubjectData()

    expect(mockFrom).toHaveBeenCalledWith('easa_subjects')
  })

  it('returns the topics fetched for the subject', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))

    const result = await getRtSubjectData()

    expect(mockGetTopicsWithSubtopics).toHaveBeenCalledWith(SUBJECT_ID)
    expect(result.topics).toEqual([TOPIC])
  })

  it('returns a single RT subject option carrying the total question count', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))

    const result = await getRtSubjectData()

    expect(result.subjects).toEqual([
      { id: SUBJECT_ID, code: 'RT', name: 'VFR RT', short: 'RT', questionCount: 5 },
    ])
  })

  it('degrades to an empty topics list when the topics fetch fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))
    mockGetTopicsWithSubtopics.mockRejectedValue(new Error('topics query failed'))

    const result = await getRtSubjectData()

    expect(result.id).toBe(SUBJECT_ID)
    expect(result.topics).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getRtSubjectData] Topics fetch failed:',
      'topics query failed',
    )
    consoleSpy.mockRestore()
  })
})

// ---- Subject-lookup error ------------------------------------------------

describe('getRtSubjectData — subject lookup failure', () => {
  it('throws when the subject query returns an error', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: null, error: { message: 'relation does not exist' } }),
    )

    await expect(getRtSubjectData()).rejects.toThrow(/Failed to load VFR RT subject/)
  })

  it('throws when the subject query returns null data without an error', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))

    await expect(getRtSubjectData()).rejects.toThrow(/Failed to load VFR RT subject/)
  })

  it('logs the raw DB error server-side before throwing the generic message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValue(
      buildChain({ data: null, error: { message: 'relation does not exist' } }),
    )

    await expect(getRtSubjectData()).rejects.toThrow()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[getRtSubjectData] Subject lookup failed:',
      'relation does not exist',
    )
    consoleSpy.mockRestore()
  })
})
