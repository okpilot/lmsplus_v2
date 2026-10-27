import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockFrom, mockRpc, mockSelect } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom, rpc: mockRpc }),
}))

// ---- Subject under test ---------------------------------------------------

import { buildTopicTree, getAllTopicTrees, groupTopicsBySubject } from './quiz-topic-trees'

// ---- Helpers --------------------------------------------------------------

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const proxy: Record<string, unknown> = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      if (prop === 'select') {
        return (...args: unknown[]) => {
          mockSelect(...args)
          return proxy
        }
      }
      return () => proxy
    },
  })
  return proxy
}

function mockTables(tables: { topics: unknown; subtopics: unknown }) {
  mockFrom.mockImplementation((table: string) =>
    buildChain(table === 'easa_topics' ? tables.topics : tables.subtopics),
  )
}

const TOPICS = [
  { id: 't1', subject_id: 's1', code: '010', name: 'Air Law', sort_order: 1 },
  { id: 't2', subject_id: 's1', code: '020', name: 'Empty topic', sort_order: 2 },
  { id: 't3', subject_id: 's2', code: '010', name: 'Nav', sort_order: 1 },
]
const SUBTOPICS = [
  { id: 'st1', topic_id: 't1', code: '010.01', name: 'Basics', sort_order: 1 },
  { id: 'st2', topic_id: 't1', code: '010.02', name: 'Zero subtopic', sort_order: 2 },
  { id: 'st3', topic_id: 't3', code: '010.01', name: 'Charts', sort_order: 1 },
]
const COUNTS = [
  { subject_id: 's1', topic_id: 't1', subtopic_id: 'st1', n: '4' },
  { subject_id: 's1', topic_id: 't1', subtopic_id: null, n: 2 },
  { subject_id: 's2', topic_id: 't3', subtopic_id: 'st3', n: 7 },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockRpc.mockResolvedValue({ data: COUNTS, error: null })
  mockTables({
    topics: { data: TOPICS, error: null, count: TOPICS.length },
    subtopics: { data: SUBTOPICS, error: null, count: SUBTOPICS.length },
  })
})

describe('getAllTopicTrees', () => {
  it('groups topics with their subtopics under each subject', async () => {
    const trees = await getAllTopicTrees()

    expect(Object.keys(trees).sort()).toEqual(['s1', 's2'])
    expect(trees.s1).toEqual([
      {
        id: 't1',
        code: '010',
        name: 'Air Law',
        questionCount: 6,
        subtopics: [{ id: 'st1', code: '010.01', name: 'Basics', questionCount: 4 }],
      },
    ])
    expect(trees.s2?.[0]?.subtopics.map((st) => st.id)).toEqual(['st3'])
  })

  it('drops topics and subtopics that have no active questions', async () => {
    const trees = await getAllTopicTrees()

    expect(trees.s1?.map((t) => t.id)).toEqual(['t1'])
    expect(trees.s1?.[0]?.subtopics.map((st) => st.id)).toEqual(['st1'])
  })

  it('omits a subject whose every topic has no active questions', async () => {
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: 't1', subtopic_id: null, n: 3 }],
      error: null,
    })

    const trees = await getAllTopicTrees()

    expect(Object.keys(trees)).toEqual(['s1'])
  })

  it('throws when the question counts come back empty so the page falls back to per-subject loading', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    await expect(getAllTopicTrees()).rejects.toThrow('Failed to fetch topic trees')
  })

  it('returns no trees without throwing when the caller can read no topics, subtopics or question counts', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    mockTables({
      topics: { data: [], error: null, count: 0 },
      subtopics: { data: [], error: null, count: 0 },
    })

    await expect(getAllTopicTrees()).resolves.toEqual({})
  })

  it('throws when the question counts read fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc down' } })

    await expect(getAllTopicTrees()).rejects.toThrow('Failed to fetch topic trees')
  })

  it('throws when the topics read fails', async () => {
    mockTables({
      topics: { data: null, error: { message: 'topics failed' }, count: null },
      subtopics: { data: SUBTOPICS, error: null, count: SUBTOPICS.length },
    })

    await expect(getAllTopicTrees()).rejects.toThrow('Failed to fetch topics: topics failed')
  })

  it('throws when the subtopics read fails', async () => {
    mockTables({
      topics: { data: TOPICS, error: null, count: TOPICS.length },
      subtopics: { data: null, error: { message: 'subtopics failed' }, count: null },
    })

    await expect(getAllTopicTrees()).rejects.toThrow('Failed to fetch subtopics: subtopics failed')
  })
})

describe('getAllTopicTrees truncation guard', () => {
  it('asks for the exact row count with each unfiltered read', async () => {
    await getAllTopicTrees()

    expect(mockSelect).toHaveBeenCalledTimes(2)
    for (const call of mockSelect.mock.calls) {
      expect(call[1]).toEqual({ count: 'exact' })
    }
  })

  it('throws when the topics read returned fewer rows than exist', async () => {
    mockTables({
      topics: { data: TOPICS, error: null, count: 1500 },
      subtopics: { data: SUBTOPICS, error: null, count: SUBTOPICS.length },
    })

    await expect(getAllTopicTrees()).rejects.toThrow('topic trees truncated at max_rows')
  })

  it('throws when the subtopics read returned fewer rows than exist', async () => {
    mockTables({
      topics: { data: TOPICS, error: null, count: TOPICS.length },
      subtopics: { data: SUBTOPICS, error: null, count: SUBTOPICS.length + 1 },
    })

    await expect(getAllTopicTrees()).rejects.toThrow('topic trees truncated at max_rows')
  })

  it('throws when the server reports no row count', async () => {
    mockTables({
      topics: { data: TOPICS, error: null, count: null },
      subtopics: { data: SUBTOPICS, error: null, count: SUBTOPICS.length },
    })

    await expect(getAllTopicTrees()).rejects.toThrow('topic trees truncated at max_rows')
  })
})

describe('groupTopicsBySubject', () => {
  it('groups topics under their subject id in the given order', () => {
    const grouped = groupTopicsBySubject(TOPICS)

    expect([...grouped.keys()]).toEqual(['s1', 's2'])
    expect(grouped.get('s1')?.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('returns no groups for no topics', () => {
    expect(groupTopicsBySubject([]).size).toBe(0)
  })
})

describe('buildTopicTree', () => {
  it('ignores count rows that belong to another subject', () => {
    const tree = buildTopicTree({
      topics: TOPICS.filter((t) => t.subject_id === 's1'),
      subtopics: SUBTOPICS,
      counts: COUNTS,
      subjectId: 's1',
    })

    expect(tree.map((t) => t.id)).toEqual(['t1'])
    expect(tree[0]?.questionCount).toBe(6)
  })

  it('returns an empty tree when the subject has no topics', () => {
    expect(buildTopicTree({ topics: [], subtopics: [], counts: COUNTS, subjectId: 's1' })).toEqual(
      [],
    )
  })
})
