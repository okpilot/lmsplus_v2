import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockFrom = vi.hoisted(() => vi.fn())
const mockCreateServerSupabaseClient = vi.hoisted(() => vi.fn())

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}))

// ---- Subject under test ---------------------------------------------------

import { getSyllabusTree } from './queries'

// ---- Helpers ---------------------------------------------------------------

/**
 * For the three queries that end in .select('*').order('sort_order').
 * select() returns the chain, order() resolves the promise.
 */
function makeOrderedChain(data: unknown[]) {
  const chain = {
    select: vi.fn(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
  }
  chain.select.mockReturnValue(chain)
  return chain
}

/**
 * For the questions query which ends in .select('subject_id, topic_id, subtopic_id')
 * with no subsequent .order() call — select() is the thenable leaf.
 */
function makeSelectOnlyChain(data: unknown[]) {
  return {
    select: vi.fn().mockResolvedValue({ data, error: null }),
  }
}

/**
 * Mock all four DB calls for a full tree fetch.
 * subjects/topics/subtopics use ordered chains; questions uses select-only chain.
 */
function mockAllFrom(
  subjects: unknown[],
  topics: unknown[],
  subtopics: unknown[],
  questions: unknown[],
) {
  mockFrom
    .mockReturnValueOnce(makeOrderedChain(subjects))
    .mockReturnValueOnce(makeOrderedChain(topics))
    .mockReturnValueOnce(makeOrderedChain(subtopics))
    .mockReturnValueOnce(makeSelectOnlyChain(questions))
  mockCreateServerSupabaseClient.mockResolvedValue({ from: mockFrom })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getSyllabusTree', () => {
  it('returns an empty tree when the DB has no subjects', async () => {
    mockAllFrom([], [], [], [])

    const tree = await getSyllabusTree()

    expect(tree).toEqual([])
  })

  it('builds a nested tree with correct question counts', async () => {
    const subjects = [{ id: 's1', code: '010', name: 'Air Law', short: 'AL', sort_order: 1 }]
    const topics = [{ id: 't1', subject_id: 's1', code: '010-01', name: 'ICAO', sort_order: 1 }]
    const subtopics = [
      { id: 'st1', topic_id: 't1', code: '010-01-01', name: 'Aims', sort_order: 1 },
    ]
    // 2 questions with full refs (subject + topic + subtopic), 1 with only subject ref
    const questions = [
      { subject_id: 's1', topic_id: 't1', subtopic_id: 'st1' },
      { subject_id: 's1', topic_id: 't1', subtopic_id: 'st1' },
      { subject_id: 's1', topic_id: null, subtopic_id: null },
    ]

    mockAllFrom(subjects, topics, subtopics, questions)

    const tree = await getSyllabusTree()

    expect(tree).toHaveLength(1)
    // Length asserted above — safe to access [0]
    const subject = tree[0]!
    expect(subject.id).toBe('s1')
    expect(subject.questionCount).toBe(3)
    expect(subject.topics).toHaveLength(1)

    const topic = subject.topics[0]!
    expect(topic.id).toBe('t1')
    expect(topic.questionCount).toBe(2)
    expect(topic.subtopics).toHaveLength(1)

    const subtopic = topic.subtopics[0]!
    expect(subtopic.id).toBe('st1')
    expect(subtopic.questionCount).toBe(2)
  })

  it('assigns zero question counts when no questions reference a node', async () => {
    const subjects = [{ id: 's1', code: '010', name: 'Air Law', short: 'AL', sort_order: 1 }]
    const topics = [{ id: 't1', subject_id: 's1', code: '010-01', name: 'ICAO', sort_order: 1 }]
    const subtopics = [
      { id: 'st1', topic_id: 't1', code: '010-01-01', name: 'Aims', sort_order: 1 },
    ]

    mockAllFrom(subjects, topics, subtopics, [])

    const tree = await getSyllabusTree()

    expect(tree[0]!.questionCount).toBe(0)
    expect(tree[0]!.topics[0]!.questionCount).toBe(0)
    expect(tree[0]!.topics[0]!.subtopics[0]!.questionCount).toBe(0)
  })

  it('only nests topics under their own subject', async () => {
    const subjects = [
      { id: 's1', code: '010', name: 'Air Law', short: 'AL', sort_order: 1 },
      { id: 's2', code: '020', name: 'Aircraft', short: 'AC', sort_order: 2 },
    ]
    const topics = [
      { id: 't1', subject_id: 's1', code: '010-01', name: 'ICAO', sort_order: 1 },
      { id: 't2', subject_id: 's2', code: '020-01', name: 'Airframe', sort_order: 1 },
    ]

    mockAllFrom(subjects, topics, [], [])

    const tree = await getSyllabusTree()

    expect(tree[0]!.topics).toHaveLength(1)
    expect(tree[0]!.topics[0]!.id).toBe('t1')
    expect(tree[1]!.topics).toHaveLength(1)
    expect(tree[1]!.topics[0]!.id).toBe('t2')
  })

  it('returns subjects with empty topics array when there are no topics', async () => {
    const subjects = [{ id: 's1', code: '010', name: 'Air Law', short: 'AL', sort_order: 1 }]

    mockAllFrom(subjects, [], [], [])

    const tree = await getSyllabusTree()

    expect(tree[0]!.topics).toEqual([])
  })

  it('gracefully handles null DB responses by defaulting to empty arrays', async () => {
    // Simulate Supabase returning null data (e.g., RLS policy filters out all rows)
    const makeNullOrderedChain = () => {
      const chain = {
        select: vi.fn(),
        order: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
      chain.select.mockReturnValue(chain)
      return chain
    }
    const makeNullSelectOnlyChain = () => ({
      select: vi.fn().mockResolvedValue({ data: null, error: null }),
    })

    mockFrom
      .mockReturnValueOnce(makeNullOrderedChain())
      .mockReturnValueOnce(makeNullOrderedChain())
      .mockReturnValueOnce(makeNullOrderedChain())
      .mockReturnValueOnce(makeNullSelectOnlyChain())
    mockCreateServerSupabaseClient.mockResolvedValue({ from: mockFrom })

    const tree = await getSyllabusTree()

    expect(tree).toEqual([])
  })
})
