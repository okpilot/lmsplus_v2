import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockLoadDrafts, mockGetActiveExamSession, mockGetActivePracticeSession } = vi.hoisted(
  () => ({
    mockLoadDrafts: vi.fn(),
    mockGetActiveExamSession: vi.fn(),
    mockGetActivePracticeSession: vi.fn(),
  }),
)

vi.mock('../actions/load-draft', () => ({
  loadDrafts: (...args: unknown[]) => mockLoadDrafts(...args),
}))

vi.mock('../actions/get-active-exam-session', () => ({
  getActiveExamSession: (...args: unknown[]) => mockGetActiveExamSession(...args),
}))

vi.mock('../actions/get-active-practice-session', () => ({
  getActivePracticeSession: (...args: unknown[]) => mockGetActivePracticeSession(...args),
}))

// ---- Subject under test ----------------------------------------------------

import { loadQuizPageData } from './load-quiz-page-data'

// ---- Fixtures --------------------------------------------------------------

const DRAFT = { id: 'draft-1' }
const EXAM_SESSION = { sessionId: 'exam-1' }
const PRACTICE_SESSION = { sessionId: 'prac-1', mode: 'quick_quiz' }

beforeEach(() => {
  vi.resetAllMocks()
  mockLoadDrafts.mockResolvedValue({ drafts: [DRAFT] })
  mockGetActiveExamSession.mockResolvedValue({
    success: true,
    sessions: [EXAM_SESSION],
    orphanedSessionIds: ['orphan-1'],
    expiredSessionIds: ['expired-1'],
  })
  mockGetActivePracticeSession.mockResolvedValue({ success: true, session: PRACTICE_SESSION })
})

// ---- Tests -----------------------------------------------------------------

describe('loadQuizPageData', () => {
  it('flattens successful results into the page view-model', async () => {
    const data = await loadQuizPageData()

    expect(data.drafts).toEqual([DRAFT])
    expect(data.examLookupFailed).toBe(false)
    expect(data.activeExams).toEqual([EXAM_SESSION])
    expect(data.orphanedIds).toEqual(['orphan-1'])
    expect(data.expiredIds).toEqual(['expired-1'])
    expect(data.practiceLookupFailed).toBe(false)
    expect(data.activePractice).toEqual(PRACTICE_SESSION)
  })

  it('marks the exam lookup as failed and defaults exam fields to empty', async () => {
    mockGetActiveExamSession.mockResolvedValue({ success: false, error: 'boom' })
    const data = await loadQuizPageData()

    expect(data.examLookupFailed).toBe(true)
    expect(data.activeExams).toEqual([])
    expect(data.orphanedIds).toEqual([])
    expect(data.expiredIds).toEqual([])
  })

  it('marks the practice lookup as failed and yields a null practice session', async () => {
    mockGetActivePracticeSession.mockResolvedValue({ success: false, error: 'boom' })
    const data = await loadQuizPageData()

    expect(data.practiceLookupFailed).toBe(true)
    expect(data.activePractice).toBeNull()
  })
})
