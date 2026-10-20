import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockShared, mockDirect, mockFrom } = vi.hoisted(() => ({
  mockShared: vi.fn(),
  mockDirect: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom }),
}))

vi.mock('./quiz-question-counts', () => ({
  getActiveQuestionCounts: () => mockShared(),
  fetchActiveQuestionCounts: () => mockDirect(),
}))

import { getSubjectsWithCounts } from './quiz-subject-queries'
import { getAllTopicTrees } from './quiz-topic-trees'

function table(result: { data: unknown; count?: number }) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void) => resolve({ error: null, ...result }),
  }
  const proxy: Record<string, unknown> = new Proxy(awaitable as Record<string, unknown>, {
    get: (target, prop) => (prop === 'then' ? target.then : () => proxy),
  })
  return proxy
}

const ROW = { subject_id: 's1', topic_id: 't1', subtopic_id: null, n: 2 }

beforeEach(() => {
  vi.resetAllMocks()
  mockShared.mockResolvedValue([ROW])
  mockFrom.mockImplementation((name: string) => {
    if (name === 'easa_subjects') {
      return table({ data: [{ id: 's1', code: '010', name: 'Law', short: 'LAW', sort_order: 1 }] })
    }
    if (name === 'easa_topics') {
      return table({
        data: [{ id: 't1', subject_id: 's1', code: '010', name: 'T', sort_order: 1 }],
        count: 1,
      })
    }
    return table({ data: [], count: 0 })
  })
})

describe('question counts shared by the setup reads', () => {
  it('builds the subject list from the shared counts read', async () => {
    const subjects = await getSubjectsWithCounts()

    expect(subjects[0]?.questionCount).toBe(2)
    expect(mockShared).toHaveBeenCalledTimes(1)
    expect(mockDirect).not.toHaveBeenCalled()
  })

  it('builds the topic trees from the shared counts read', async () => {
    const trees = await getAllTopicTrees()

    expect(trees.s1?.[0]?.questionCount).toBe(2)
    expect(mockShared).toHaveBeenCalledTimes(1)
    expect(mockDirect).not.toHaveBeenCalled()
  })
})
