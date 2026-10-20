import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetSubjects, mockGetExamSubjects, mockLoadPreload } = vi.hoisted(() => ({
  mockGetSubjects: vi.fn(),
  mockGetExamSubjects: vi.fn(),
  mockLoadPreload: vi.fn(),
}))

vi.mock('@/lib/queries/quiz-subject-queries', () => ({ getSubjectsWithCounts: mockGetSubjects }))
vi.mock('@/lib/queries/exam-subjects', () => ({ getMockExamSubjects: mockGetExamSubjects }))
vi.mock('@/lib/queries/quiz-setup-preload', () => ({ loadQuizSetupPreload: mockLoadPreload }))
vi.mock('./quiz-config-form', () => ({ QuizConfigForm: () => null }))

// ---- Subject under test ---------------------------------------------------

import { SubjectsSection } from './subjects-section'

// ---- Fixtures -------------------------------------------------------------

const SUBJECTS = [{ id: 's1', code: '010', name: 'Air Law', short: 'AL', questionCount: 5 }]
const PRELOAD = { topicsBySubject: {}, discoveryCounts: {} }

async function props() {
  const element = (await SubjectsSection({ userId: 'u1' })) as ReactElement<Record<string, unknown>>
  return element.props
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetSubjects.mockResolvedValue(SUBJECTS)
  mockGetExamSubjects.mockResolvedValue([])
  mockLoadPreload.mockResolvedValue(PRELOAD)
})

describe('SubjectsSection', () => {
  it('passes the setup preload to the quiz form as an unresolved promise', async () => {
    const preload = (await props()).preload

    expect(preload).toBeInstanceOf(Promise)
    await expect(preload).resolves.toEqual(PRELOAD)
  })

  it('renders the form without waiting for the preload to settle', async () => {
    mockLoadPreload.mockReturnValue(new Promise(() => undefined))

    const p = await props()

    expect(p.subjects).toEqual(SUBJECTS)
    expect(p.preload).toBeInstanceOf(Promise)
  })

  it('renders the form with the subject and exam lists', async () => {
    const p = await props()

    expect(p.subjects).toEqual(SUBJECTS)
    expect(p.examSubjects).toEqual([])
  })
})
