import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
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

const PARTS: TopicWithSubtopics[] = [
  { id: 'p1', code: 'P1', name: 'Part 1', questionCount: 10, subtopics: [] },
  { id: 'p2', code: 'P2', name: 'Part 2', questionCount: 9, subtopics: [] },
]

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Happy path -----------------------------------------------------------

describe('getRtSubjectData — happy path', () => {
  it('returns the subject id and its topics when both lookups succeed', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))
    mockGetTopicsWithSubtopics.mockResolvedValue(PARTS)

    const result = await getRtSubjectData()

    expect(result.id).toBe(SUBJECT_ID)
    expect(result.parts).toHaveLength(2)
    expect(result.parts[0]?.id).toBe('p1')
  })

  it('queries the easa_subjects table for the RT subject code', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))
    mockGetTopicsWithSubtopics.mockResolvedValue([])

    await getRtSubjectData()

    expect(mockFrom).toHaveBeenCalledWith('easa_subjects')
  })

  it('loads the parts for the resolved RT subject', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))
    mockGetTopicsWithSubtopics.mockResolvedValue(PARTS)

    await getRtSubjectData()

    expect(mockGetTopicsWithSubtopics).toHaveBeenCalledWith(SUBJECT_ID)
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

  it('does not attempt to load parts when the subject lookup fails', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'not found' } }))

    await expect(getRtSubjectData()).rejects.toThrow()
    expect(mockGetTopicsWithSubtopics).not.toHaveBeenCalled()
  })
})

// ---- Topics degrade path -------------------------------------------------

describe('getRtSubjectData — topics degrade path', () => {
  it('returns the subject with empty parts when the parts fetch fails', async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))
    mockGetTopicsWithSubtopics.mockRejectedValue(new Error('DB timeout'))

    const result = await getRtSubjectData()

    expect(result.id).toBe(SUBJECT_ID)
    expect(result.parts).toEqual([])
  })

  it('logs an error when the parts fetch fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))
    mockGetTopicsWithSubtopics.mockRejectedValue(new Error('DB timeout'))

    await getRtSubjectData()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[getRtSubjectData] Failed to load RT topics:',
      'DB timeout',
    )
    consoleSpy.mockRestore()
  })

  it('logs a non-Error thrown value as-is', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValue(buildChain({ data: { id: SUBJECT_ID }, error: null }))
    mockGetTopicsWithSubtopics.mockRejectedValue('string rejection')

    await getRtSubjectData()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[getRtSubjectData] Failed to load RT topics:',
      'string rejection',
    )
    consoleSpy.mockRestore()
  })
})
