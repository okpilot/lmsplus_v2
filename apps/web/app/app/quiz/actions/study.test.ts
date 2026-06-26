import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetRandomQuestionIds, mockGetStudyQuestions } = vi.hoisted(() => ({
  mockGetRandomQuestionIds: vi.fn(),
  mockGetStudyQuestions: vi.fn(),
}))

vi.mock('@/lib/queries/quiz-session-queries', () => ({
  getRandomQuestionIds: (...args: unknown[]) => mockGetRandomQuestionIds(...args),
}))

vi.mock('@/lib/queries/study-queries', () => ({
  getStudyQuestions: (...args: unknown[]) => mockGetStudyQuestions(...args),
}))

// ---- Subject under test ---------------------------------------------------

import type { StudyQuestion } from '@/lib/queries/study-queries'
import { startStudy } from './study'

// ---- Fixtures -------------------------------------------------------------

const VALID_SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const VALID_INPUT = { subjectId: VALID_SUBJECT_ID, count: 10 }
const QUESTION_IDS = [
  '00000000-0000-4000-a000-000000000011',
  '00000000-0000-4000-a000-000000000022',
]

function makeQuestion(id = QUESTION_IDS[0]!): StudyQuestion {
  return {
    id,
    questionText: 'What is the MATZ horizontal radius?',
    questionImageUrl: null,
    options: [
      { id: 'a', text: '2 nm' },
      { id: 'b', text: '5 nm' },
    ],
    correctOptionId: 'b',
    subjectCode: 'ALW',
    topicName: 'Airspace',
    subtopicName: null,
    explanationText: 'A MATZ extends 5 nm from the aerodrome.',
    explanationImageUrl: null,
    questionNumber: null,
    difficulty: null,
  }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockGetRandomQuestionIds.mockResolvedValue(QUESTION_IDS)
  mockGetStudyQuestions.mockResolvedValue([makeQuestion()])
})

// ---- Validation -----------------------------------------------------------

describe('startStudy — input validation', () => {
  it('returns a validation error when subjectId is not a valid UUID', async () => {
    const result = await startStudy({ subjectId: 'not-a-uuid', count: 10 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('returns a validation error when count is missing', async () => {
    const result = await startStudy({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('returns a validation error when count is below the minimum', async () => {
    const result = await startStudy({ subjectId: VALID_SUBJECT_ID, count: 0 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('does not call getRandomQuestionIds when input is invalid', async () => {
    await startStudy({ subjectId: 'bad' })
    expect(mockGetRandomQuestionIds).not.toHaveBeenCalled()
  })
})

// ---- Question type restriction -------------------------------------------

describe('startStudy — question type restriction', () => {
  it('requests only multiple_choice question ids', async () => {
    await startStudy(VALID_INPUT)
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({ questionType: 'multiple_choice' }),
    )
  })
})

// ---- Empty id list -------------------------------------------------------

describe('startStudy — empty question pool', () => {
  it('returns an empty questions array without fetching questions when no ids are available', async () => {
    mockGetRandomQuestionIds.mockResolvedValue([])
    const result = await startStudy(VALID_INPUT)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions).toEqual([])
    expect(mockGetStudyQuestions).not.toHaveBeenCalled()
  })
})

// ---- Happy path ----------------------------------------------------------

describe('startStudy — happy path', () => {
  it('returns the fetched questions on a successful run', async () => {
    const q = makeQuestion()
    mockGetStudyQuestions.mockResolvedValue([q])
    const result = await startStudy(VALID_INPUT)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions).toEqual([q])
  })

  it('passes the resolved question ids to the study question fetcher', async () => {
    await startStudy(VALID_INPUT)
    expect(mockGetStudyQuestions).toHaveBeenCalledWith(QUESTION_IDS)
  })

  it('passes optional topicIds, subtopicIds, filters, calc and image modes to the question id fetcher', async () => {
    const topicIds = ['00000000-0000-4000-a000-000000000030']
    const subtopicIds = ['00000000-0000-4000-a000-000000000040']
    await startStudy({
      ...VALID_INPUT,
      topicIds,
      subtopicIds,
      filters: ['flagged'],
      calcMode: 'exclude',
      imageMode: 'only',
    })
    expect(mockGetRandomQuestionIds).toHaveBeenCalledWith(
      expect.objectContaining({
        topicIds,
        subtopicIds,
        filters: ['flagged'],
        calcMode: 'exclude',
        imageMode: 'only',
      }),
    )
  })
})

// ---- Error path ----------------------------------------------------------

describe('startStudy — error path', () => {
  it('returns a generic error message when an unexpected exception is thrown', async () => {
    mockGetRandomQuestionIds.mockRejectedValue(new Error('DB connection timeout'))
    const result = await startStudy(VALID_INPUT)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start study session')
  })

  it('does not leak the raw exception message in the error response', async () => {
    mockGetRandomQuestionIds.mockRejectedValue(new Error('internal_secret_db_detail'))
    const result = await startStudy(VALID_INPUT)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).not.toContain('internal_secret_db_detail')
  })

  it('tells the user to exit their exam when an exam session is active', async () => {
    // get_study_questions raises 'active_exam_session' (carried through the helper's
    // wrapped message) when the caller is mid-exam — Study Mode reveals answer keys.
    mockGetStudyQuestions.mockRejectedValue(
      new Error('Failed to fetch study questions: active_exam_session'),
    )
    const result = await startStudy(VALID_INPUT)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Finish or exit your active exam first.')
  })
})
