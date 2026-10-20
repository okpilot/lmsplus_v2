import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetSubjects, mockGetExamSubjects, mockGetTrees, mockGetCounts } = vi.hoisted(() => ({
  mockGetSubjects: vi.fn(),
  mockGetExamSubjects: vi.fn(),
  mockGetTrees: vi.fn(),
  mockGetCounts: vi.fn(),
}))

vi.mock('@/lib/queries/quiz-subject-queries', () => ({ getSubjectsWithCounts: mockGetSubjects }))
vi.mock('@/lib/queries/exam-subjects', () => ({ getMockExamSubjects: mockGetExamSubjects }))
vi.mock('@/lib/queries/quiz-topic-trees', () => ({ getAllTopicTrees: mockGetTrees }))
vi.mock('@/lib/queries/discovery-counts', () => ({ getDiscoveryCounts: mockGetCounts }))
vi.mock('./quiz-config-form', () => ({ QuizConfigForm: () => null }))

// ---- Subject under test ---------------------------------------------------

import { SubjectsSection } from './subjects-section'

// ---- Fixtures -------------------------------------------------------------

const SUBJECTS = [{ id: 's1', code: '010', name: 'Air Law', short: 'AL', questionCount: 5 }]
const TREES = { s1: [{ id: 't1', code: '010', name: 'T', questionCount: 5, subtopics: [] }] }
const COUNTS = { s1: { count: 5, byTopic: { t1: 5 }, bySubtopic: {} } }

async function props() {
  const element = (await SubjectsSection({ userId: 'u1' })) as ReactElement<Record<string, unknown>>
  return element.props
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetSubjects.mockResolvedValue(SUBJECTS)
  mockGetExamSubjects.mockResolvedValue([])
  mockGetTrees.mockResolvedValue(TREES)
  mockGetCounts.mockResolvedValue(COUNTS)
})

describe('SubjectsSection', () => {
  it('passes the preloaded topic trees and Discovery counts to the quiz form', async () => {
    expect((await props()).preload).toEqual({ topicsBySubject: TREES, discoveryCounts: COUNTS })
  })

  it('falls back to an empty preload when the topic-tree read fails', async () => {
    mockGetTrees.mockRejectedValue(new Error('trees failed'))

    expect((await props()).preload).toEqual({ topicsBySubject: {}, discoveryCounts: COUNTS })
  })

  it('falls back to an empty preload when the Discovery-count read fails', async () => {
    mockGetCounts.mockRejectedValue(new Error('counts failed'))

    expect((await props()).preload).toEqual({ topicsBySubject: TREES, discoveryCounts: {} })
  })

  it('still renders the form with the subject list when both preload reads fail', async () => {
    mockGetTrees.mockRejectedValue(new Error('x'))
    mockGetCounts.mockRejectedValue(new Error('y'))

    const p = await props()

    expect(p.subjects).toEqual(SUBJECTS)
    expect(p.preload).toEqual({ topicsBySubject: {}, discoveryCounts: {} })
  })
})
