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

import { getProgressData } from './progress'

// ---- Helpers --------------------------------------------------------------

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getProgressData', () => {
  it('throws when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getProgressData()).rejects.toThrow('Not authenticated')
  })

  it('returns empty array when there are no subjects', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects') return buildChain({ data: [] })
      if (table === 'easa_topics') return buildChain({ data: [] })
      if (table === 'questions') return buildChain({ data: [] })
      if (table === 'student_responses') return buildChain({ data: [] })
      return buildChain({ data: null })
    })

    const result = await getProgressData()
    expect(result).toEqual([])
  })

  it('calculates masteryPercentage per subject based on correct responses', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'easa_topics')
        return buildChain({
          data: [{ id: 't1', code: '050-01', name: 'Airframe', subject_id: 's1', sort_order: 1 }],
        })
      if (table === 'questions')
        return buildChain({
          data: [
            { id: 'q1', subject_id: 's1', topic_id: 't1' },
            { id: 'q2', subject_id: 's1', topic_id: 't1' },
            { id: 'q3', subject_id: 's1', topic_id: 't1' },
            { id: 'q4', subject_id: 's1', topic_id: 't1' },
          ],
        })
      if (table === 'student_responses')
        return buildChain({
          data: [{ question_id: 'q1' }, { question_id: 'q2' }], // 2 of 4 correct
        })
      return buildChain({ data: null })
    })

    const result = await getProgressData()
    expect(result).toHaveLength(1)
    expect(result[0].totalQuestions).toBe(4)
    expect(result[0].answeredCorrectly).toBe(2)
    expect(result[0].masteryPercentage).toBe(50)
  })

  it('includes topic breakdown within each subject', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'easa_topics')
        return buildChain({
          data: [
            { id: 't1', code: '050-01', name: 'Airframe', subject_id: 's1', sort_order: 1 },
            { id: 't2', code: '050-02', name: 'Engines', subject_id: 's1', sort_order: 2 },
          ],
        })
      if (table === 'questions')
        return buildChain({
          data: [
            { id: 'q1', subject_id: 's1', topic_id: 't1' },
            { id: 'q2', subject_id: 's1', topic_id: 't2' },
          ],
        })
      if (table === 'student_responses') return buildChain({ data: [{ question_id: 'q1' }] })
      return buildChain({ data: null })
    })

    const result = await getProgressData()
    expect(result[0].topics).toHaveLength(2)
    const t1 = result[0].topics.find((t) => t.id === 't1')
    const t2 = result[0].topics.find((t) => t.id === 't2')
    expect(t1?.masteryPercentage).toBe(100) // q1 correct, 1 of 1
    expect(t2?.masteryPercentage).toBe(0) // q2 not correct, 0 of 1
  })

  it('filters out subjects with no questions', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [
            { id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 },
            { id: 's2', code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 2 },
          ],
        })
      if (table === 'easa_topics') return buildChain({ data: [] })
      if (table === 'questions')
        return buildChain({ data: [{ id: 'q1', subject_id: 's1', topic_id: null }] })
      if (table === 'student_responses') return buildChain({ data: [] })
      return buildChain({ data: null })
    })

    const result = await getProgressData()
    // s2 has no questions → filtered
    expect(result.every((s) => s.totalQuestions > 0)).toBe(true)
    expect(result.find((s) => s.id === 's2')).toBeUndefined()
  })

  it('sets masteryPercentage to 0 when a subject has questions but none answered correctly', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'easa_subjects')
        return buildChain({
          data: [{ id: 's1', code: 'AGK', name: 'Aircraft General', short: 'AGK', sort_order: 1 }],
        })
      if (table === 'easa_topics') return buildChain({ data: [] })
      if (table === 'questions')
        return buildChain({ data: [{ id: 'q1', subject_id: 's1', topic_id: 't1' }] })
      if (table === 'student_responses') return buildChain({ data: [] }) // no correct responses
      return buildChain({ data: null })
    })

    const result = await getProgressData()
    expect(result[0].masteryPercentage).toBe(0)
    expect(result[0].answeredCorrectly).toBe(0)
  })
})
