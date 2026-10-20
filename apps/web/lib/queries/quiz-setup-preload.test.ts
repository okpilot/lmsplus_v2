import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSubjects, mockTrees, mockCounts } = vi.hoisted(() => ({
  mockSubjects: vi.fn(),
  mockTrees: vi.fn(),
  mockCounts: vi.fn(),
}))

vi.mock('./quiz-subject-queries', () => ({ getSubjectsWithCounts: () => mockSubjects() }))
vi.mock('./quiz-topic-trees', () => ({ getAllTopicTrees: () => mockTrees() }))
vi.mock('./discovery-counts', () => ({ getDiscoveryCounts: () => mockCounts() }))

import { loadQuizSetupPreload } from './quiz-setup-preload'

const TREE = [{ id: 't1', code: '010', name: 'T', questionCount: 3, subtopics: [] }]
const COUNT = { count: 3, byTopic: { t1: 3 }, bySubtopic: {} }

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mockSubjects.mockResolvedValue([{ id: 's1' }, { id: 's2' }])
  mockTrees.mockResolvedValue({ s1: TREE, s2: TREE, rt: TREE })
  mockCounts.mockResolvedValue({ s1: { '': COUNT }, s2: { '': COUNT }, rt: { '': COUNT } })
})

describe('loadQuizSetupPreload', () => {
  it('returns the topic trees and counts of the pickable subjects', async () => {
    const preload = await loadQuizSetupPreload()

    expect(Object.keys(preload.topicsBySubject).sort()).toEqual(['s1', 's2'])
    expect(Object.keys(preload.discoveryCounts).sort()).toEqual(['s1', 's2'])
    expect(preload.discoveryCounts.s1?.['']).toEqual(COUNT)
  })

  it('leaves out subjects that are not in the picker list', async () => {
    const preload = await loadQuizSetupPreload()

    expect(preload.topicsBySubject).not.toHaveProperty('rt')
    expect(preload.discoveryCounts).not.toHaveProperty('rt')
  })

  it('resolves empty and logs when the topic trees fail', async () => {
    mockTrees.mockRejectedValue(new Error('trees down'))

    const preload = await loadQuizSetupPreload()

    expect(preload.topicsBySubject).toEqual({})
    expect(Object.keys(preload.discoveryCounts)).toEqual(['s1', 's2'])
    expect(errorSpy).toHaveBeenCalledWith(
      '[quizSetupPreload] topic trees failed:',
      expect.any(Error),
    )
  })

  it('resolves empty and logs when the counts fail', async () => {
    mockCounts.mockRejectedValue(new Error('counts down'))

    const preload = await loadQuizSetupPreload()

    expect(preload.discoveryCounts).toEqual({})
    expect(Object.keys(preload.topicsBySubject)).toEqual(['s1', 's2'])
    expect(errorSpy).toHaveBeenCalledWith('[quizSetupPreload] counts failed:', expect.any(Error))
  })

  it('resolves empty on both maps when every read rejects', async () => {
    mockSubjects.mockRejectedValue(new Error('subjects down'))
    mockTrees.mockRejectedValue(new Error('trees down'))
    mockCounts.mockRejectedValue(new Error('counts down'))

    await expect(loadQuizSetupPreload()).resolves.toEqual({
      topicsBySubject: {},
      discoveryCounts: {},
    })
    expect(errorSpy).toHaveBeenCalledWith('[quizSetupPreload] subjects failed:', expect.any(Error))
  })
})
