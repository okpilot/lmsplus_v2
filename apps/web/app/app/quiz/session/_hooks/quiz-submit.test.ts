import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const {
  mockBatchSubmitQuiz,
  mockDeleteDraft,
  mockSaveDraft,
  mockDiscardQuiz,
  mockRouterPush,
  mockSubmitEmptyExamSession,
} = vi.hoisted(() => ({
  mockBatchSubmitQuiz: vi.fn(),
  mockDeleteDraft: vi.fn(),
  mockSaveDraft: vi.fn(),
  mockDiscardQuiz: vi.fn(),
  mockRouterPush: vi.fn(),
  mockSubmitEmptyExamSession: vi.fn(),
}))

vi.mock('../../actions/batch-submit', () => ({
  batchSubmitQuiz: (...args: unknown[]) => mockBatchSubmitQuiz(...args),
}))

vi.mock('../../actions/draft', () => ({
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
}))
vi.mock('../../actions/draft-delete', () => ({
  deleteDraft: (...args: unknown[]) => mockDeleteDraft(...args),
}))
vi.mock('../../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))

vi.mock('../../actions/submit-empty-exam', () => ({
  submitEmptyExamSession: (...args: unknown[]) => mockSubmitEmptyExamSession(...args),
}))

const { mockClearDeploymentPin } = vi.hoisted(() => ({
  mockClearDeploymentPin: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../actions/clear-deployment-pin', () => ({
  clearDeploymentPin: mockClearDeploymentPin,
}))

const { mockClearActiveSession } = vi.hoisted(() => ({
  mockClearActiveSession: vi.fn(),
}))

vi.mock('../_utils/quiz-session-storage', () => ({
  clearActiveSession: mockClearActiveSession,
}))

// ---- Subject under test ---------------------------------------------------

import {
  handleDiscardSession,
  handleSaveSession,
  handleSubmitSession,
  saveQuizDraft,
  submitQuizSession,
} from './quiz-submit'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'
const DRAFT_ID = '00000000-0000-4000-a000-000000000050'
const USER_ID = 'test-user-id'

function makeAnswers(
  entries: Array<[string, { selectedOptionId: string; responseTimeMs: number }]>,
) {
  return new Map(entries)
}

const TWO_ANSWERS = makeAnswers([
  [Q1_ID, { selectedOptionId: 'opt-a', responseTimeMs: 1500 }],
  [Q2_ID, { selectedOptionId: 'opt-c', responseTimeMs: 2000 }],
])

const BATCH_SUCCESS = {
  success: true as const,
  totalQuestions: 2,
  answeredCount: 2,
  correctCount: 1,
  scorePercentage: 50,
  results: [],
}

function makeRouter() {
  return { push: mockRouterPush }
}

// ---- Lifecycle -----------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockDeleteDraft.mockResolvedValue({ success: true })
  mockClearDeploymentPin.mockResolvedValue(undefined)
  mockSubmitEmptyExamSession.mockResolvedValue({ success: true, sessionId: SESSION_ID })
})

// ---- submitQuizSession ---------------------------------------------------

describe('submitQuizSession', () => {
  it('returns success after submitting all answers', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)

    const result = await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.totalQuestions).toBe(2)
      expect(result.correctCount).toBe(1)
      expect(result.scorePercentage).toBe(50)
    }
  })

  it('formats answers as the expected array shape', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)

    await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID)

    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: expect.arrayContaining([
        { questionId: Q1_ID, selectedOptionId: 'opt-a', responseTimeMs: 1500 },
        { questionId: Q2_ID, selectedOptionId: 'opt-c', responseTimeMs: 2000 },
      ]),
    })
  })

  it('cleans up saved draft after successful submission', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)

    await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID, DRAFT_ID)

    expect(mockDeleteDraft).toHaveBeenCalledWith({ draftId: DRAFT_ID })
    expect(mockDeleteDraft).toHaveBeenCalledTimes(1)
  })

  it('skips draft cleanup when no draft exists', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)

    await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID)

    expect(mockDeleteDraft).not.toHaveBeenCalled()
  })

  it('returns failure when batch submission fails', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({
      success: false,
      error: 'session not found',
    })

    const result = await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('session not found')
  })

  it('preserves saved draft when submission fails', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({ success: false, error: 'session not found' })

    await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID, DRAFT_ID)

    expect(mockDeleteDraft).not.toHaveBeenCalled()
  })

  it('returns generic failure when submission throws unexpectedly', async () => {
    mockBatchSubmitQuiz.mockRejectedValue(new Error('network error'))

    const result = await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
  })

  it('submits an empty answers list when no answers recorded', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({ success: false, error: 'No answers' })

    const result = await submitQuizSession(SESSION_ID, new Map(), USER_ID)

    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: [],
    })
    expect(result.success).toBe(false)
  })

  it('clears active session from localStorage after successful submission', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)

    await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID)

    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })

  it('does not clear active session when submission fails', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({ success: false, error: 'session not found' })

    await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID)

    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('logs error when draft cleanup fails after successful submit', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const cleanupError = new Error('draft cleanup network failure')
    mockDeleteDraft.mockRejectedValue(cleanupError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const result = await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID, DRAFT_ID)

      // Submit still succeeds despite cleanup failure
      expect(result.success).toBe(true)

      // Fire-and-forget: give the microtask queue time to reject
      await Promise.resolve()

      expect(consoleSpy).toHaveBeenCalledWith(
        '[submitQuizSession] Draft cleanup failed:',
        cleanupError,
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})

// ---- saveQuizDraft -------------------------------------------------------

describe('saveQuizDraft', () => {
  it('saves serialised answers and current position', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID, Q2_ID],
      answers: TWO_ANSWERS,
      currentIndex: 1,
      router: makeRouter() as never,
    })

    expect(mockSaveDraft).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      questionIds: [Q1_ID, Q2_ID],
      answers: {
        [Q1_ID]: { selectedOptionId: 'opt-a', responseTimeMs: 1500 },
        [Q2_ID]: { selectedOptionId: 'opt-c', responseTimeMs: 2000 },
      },
      currentIndex: 1,
    })
  })

  it('redirects to quiz page after saving', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    const result = await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
    })

    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz')
    expect(result.success).toBe(true)
  })

  it('clears active session from localStorage after a successful save', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
    })

    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })

  it('does not clear active session when save fails', async () => {
    mockSaveDraft.mockResolvedValue({ success: false, error: 'Failed to save draft' })

    await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
    })

    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('stays on page when save fails', async () => {
    mockSaveDraft.mockResolvedValue({ success: false, error: 'Failed to save draft' })

    const result = await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
    })

    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Failed to save draft')
  })

  it('serialises answers Map to a plain object', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: makeAnswers([[Q1_ID, { selectedOptionId: 'opt-b', responseTimeMs: 800 }]]),
      currentIndex: 0,
      router: makeRouter() as never,
    })

    const [called] = mockSaveDraft.mock.calls[0]!
    // answers must be a plain object, not a Map
    expect(called.answers).not.toBeInstanceOf(Map)
    expect(called.answers[Q1_ID]).toEqual({ selectedOptionId: 'opt-b', responseTimeMs: 800 })
  })

  it('includes subject metadata when saving', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
      subjectName: 'Air Law',
      subjectCode: 'ALW',
    })

    expect(mockSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectName: 'Air Law',
        subjectCode: 'ALW',
      }),
    )
  })

  it('omits subject metadata when not provided', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
    })

    const [called] = mockSaveDraft.mock.calls[0]!
    expect(called.subjectName).toBeUndefined()
    expect(called.subjectCode).toBeUndefined()
  })

  it('returns generic failure when saveDraft throws unexpectedly', async () => {
    mockSaveDraft.mockRejectedValue(new Error('network error'))

    const result = await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
  })

  it('does not navigate or clear session when saveDraft throws', async () => {
    mockSaveDraft.mockRejectedValue(new Error('network error'))

    await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
    })

    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('serialises feedback map to a plain object when provided', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })
    const feedbackMap = new Map([
      [
        Q1_ID,
        {
          isCorrect: true,
          correctOptionId: 'opt-a',
          explanationText: 'Because lift.',
          explanationImageUrl: null,
        },
      ],
    ])

    await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
      feedback: feedbackMap,
    })

    const [called] = mockSaveDraft.mock.calls[0]!
    expect(called.feedback).not.toBeInstanceOf(Map)
    expect(called.feedback[Q1_ID]).toEqual({
      isCorrect: true,
      correctOptionId: 'opt-a',
      explanationText: 'Because lift.',
      explanationImageUrl: null,
    })
  })

  it('passes feedback as undefined when no feedback map is provided', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    await saveQuizDraft({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
    })

    const [called] = mockSaveDraft.mock.calls[0]!
    expect(called.feedback).toBeUndefined()
  })
})

// ---- handleSubmitSession -------------------------------------------------

describe('handleSubmitSession', () => {
  function makeOpts(overrides?: Partial<Parameters<typeof handleSubmitSession>[0]>) {
    return {
      userId: USER_ID,
      sessionId: SESSION_ID,
      answers: TWO_ANSWERS,
      draftId: undefined,
      router: makeRouter() as never,
      setSubmitting: vi.fn(),
      setError: vi.fn(),
      onSuccess: vi.fn(),
      ...overrides,
    }
  }

  it('shows error when submitting with no answers', async () => {
    const opts = makeOpts({ answers: new Map() })
    await handleSubmitSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('No answers to submit.')
    expect(opts.setSubmitting).not.toHaveBeenCalled()
    expect(mockBatchSubmitQuiz).not.toHaveBeenCalled()
  })

  it('navigates to report page after successful submission', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const opts = makeOpts()
    await handleSubmitSession(opts)
    expect(opts.onSuccess).toHaveBeenCalledTimes(1)
    expect(opts.router.push).toHaveBeenCalledWith(`/app/quiz/report?session=${SESSION_ID}`)
    expect(opts.setError).toHaveBeenCalledWith(null)
  })

  it('shows error and stops loading when submission fails', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({ success: false, error: 'session discarded' })
    const opts = makeOpts()
    await handleSubmitSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('session discarded')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
    expect(opts.onSuccess).not.toHaveBeenCalled()
    expect(opts.router.push).not.toHaveBeenCalled()
  })

  it('shows loading state before submitting', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const setSubmittingOrder: boolean[] = []
    const setErrorOrder: Array<string | null> = []
    const opts = makeOpts({
      setSubmitting: vi.fn((v: boolean) => setSubmittingOrder.push(v)),
      setError: vi.fn((e: string | null) => setErrorOrder.push(e)),
    })
    await handleSubmitSession(opts)
    expect(setSubmittingOrder[0]).toBe(true)
    expect(setErrorOrder[0]).toBeNull()
  })

  it('calls submitEmptyExamSession when exam times out with no answers', async () => {
    const opts = makeOpts({ answers: new Map(), isExam: true })
    await handleSubmitSession(opts)
    expect(mockSubmitEmptyExamSession).toHaveBeenCalledWith({ sessionId: SESSION_ID })
  })

  it('redirects to report page with session id when exam times out with no answers', async () => {
    const opts = makeOpts({ answers: new Map(), isExam: true })
    await handleSubmitSession(opts)
    expect(opts.router.push).toHaveBeenCalledWith(`/app/quiz/report?session=${SESSION_ID}`)
  })

  it('clears active session on successful zero-answer exam completion', async () => {
    const opts = makeOpts({ answers: new Map(), isExam: true })
    await handleSubmitSession(opts)
    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })

  it('fires clearDeploymentPin on successful zero-answer exam completion', async () => {
    const opts = makeOpts({ answers: new Map(), isExam: true })
    await handleSubmitSession(opts)
    expect(mockClearDeploymentPin).toHaveBeenCalledTimes(1)
  })

  it('does not call discardQuiz on successful zero-answer exam completion', async () => {
    const opts = makeOpts({ answers: new Map(), isExam: true })
    await handleSubmitSession(opts)
    expect(mockDiscardQuiz).not.toHaveBeenCalled()
  })

  it('invokes onSuccess and pushes to /app/quiz/report on zero-answer exam success', async () => {
    const opts = makeOpts({ answers: new Map(), isExam: true })
    await handleSubmitSession(opts)
    expect(opts.onSuccess).toHaveBeenCalledTimes(1)
    expect(opts.router.push).toHaveBeenCalledWith(`/app/quiz/report?session=${SESSION_ID}`)
  })

  it('sets setSubmitting(true) but not setError on successful zero-answer exam completion', async () => {
    const opts = makeOpts({ answers: new Map(), isExam: true })
    await handleSubmitSession(opts)
    expect(opts.setError).not.toHaveBeenCalled()
    // setSubmitting(true) fires to show loading; navigation takes over (no false call)
    expect(opts.setSubmitting).toHaveBeenCalledWith(true)
    expect(opts.setSubmitting).not.toHaveBeenCalledWith(false)
  })

  it('falls back to discard + /app/quiz when submitEmptyExamSession fails', async () => {
    mockSubmitEmptyExamSession.mockResolvedValue({
      success: false,
      error: 'Session not found.',
    })
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const opts = makeOpts({ answers: new Map(), isExam: true })
    await handleSubmitSession(opts)
    expect(mockDiscardQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      draftId: undefined,
    })
    expect(opts.router.push).toHaveBeenCalledWith('/app/quiz')
  })

  it('sets error when submitEmptyExamSession fails', async () => {
    mockSubmitEmptyExamSession.mockResolvedValue({
      success: false,
      error: 'Session not found.',
    })
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const opts = makeOpts({ answers: new Map(), isExam: true })
    await handleSubmitSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('Session not found.')
  })

  it('still redirects to /app/quiz when fallback discardQuiz throws', async () => {
    mockSubmitEmptyExamSession.mockResolvedValue({
      success: false,
      error: 'Failed to complete Practice Exam.',
    })
    mockDiscardQuiz.mockRejectedValue(new Error('network'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const opts = makeOpts({ answers: new Map(), isExam: true })
      await handleSubmitSession(opts)
      expect(opts.router.push).toHaveBeenCalledWith('/app/quiz')
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('forwards draftId to discardQuiz and calls setSubmitting(false) on fallback failure', async () => {
    mockSubmitEmptyExamSession.mockResolvedValue({ success: false, error: 'X' })
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const opts = makeOpts({ answers: new Map(), isExam: true, draftId: DRAFT_ID })
      await handleSubmitSession(opts)
      expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: SESSION_ID, draftId: DRAFT_ID })
      expect(opts.setError).toHaveBeenCalledWith('X')
      expect(opts.router.push).toHaveBeenCalledWith('/app/quiz')
      expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('routes to /app/quiz and clears submitting when submitEmptyExamSession rejects', async () => {
    // RSC stream / network failures bypass the action's internal try/catch and
    // surface as a rejected promise. Without our outer catch, the student would
    // be stuck with the spinner spinning forever.
    mockSubmitEmptyExamSession.mockRejectedValue(new Error('network'))
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const opts = makeOpts({ answers: new Map(), isExam: true })
      await handleSubmitSession(opts)
      expect(opts.router.push).toHaveBeenCalledWith('/app/quiz')
      expect(opts.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')
      expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
      expect(mockDiscardQuiz).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        draftId: undefined,
      })
    } finally {
      consoleSpy.mockRestore()
    }
  })
})

// ---- handleSaveSession ---------------------------------------------------

describe('handleSaveSession', () => {
  function makeOpts(overrides?: Partial<Parameters<typeof handleSaveSession>[0]>) {
    return {
      userId: USER_ID,
      sessionId: SESSION_ID,
      questions: [{ id: Q1_ID }, { id: Q2_ID }],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
      draftId: undefined,
      subjectName: undefined,
      subjectCode: undefined,
      setSubmitting: vi.fn(),
      setError: vi.fn(),
      ...overrides,
    }
  }

  it('shows loading state before saving', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.setSubmitting).toHaveBeenCalledWith(true)
    expect(opts.setError).toHaveBeenCalledWith(null)
  })

  it('clears without error when save succeeds', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleSaveSession(opts)
    // setError(null) from setup, no second call with an error string
    const errorCalls = (opts.setError as ReturnType<typeof vi.fn>).mock.calls
    const errorStrings = errorCalls.filter(([v]) => v !== null)
    expect(errorStrings).toHaveLength(0)
  })

  it('shows error and stops loading when save fails', async () => {
    mockSaveDraft.mockResolvedValue({ success: false, error: 'draft limit reached' })
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('draft limit reached')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
  })

  it('extracts question ids from questions array for saving', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleSaveSession(opts)
    const [called] = mockSaveDraft.mock.calls[0]!
    expect(called.questionIds).toEqual([Q1_ID, Q2_ID])
  })
})

// ---- handleDiscardSession ------------------------------------------------

describe('handleDiscardSession', () => {
  function makeOpts(overrides?: Partial<Parameters<typeof handleDiscardSession>[0]>) {
    return {
      userId: USER_ID,
      sessionId: SESSION_ID,
      router: makeRouter() as never,
      draftId: undefined,
      setSubmitting: vi.fn(),
      setError: vi.fn(),
      ...overrides,
    }
  }

  it('shows loading state before discarding', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleDiscardSession(opts)
    expect(opts.setSubmitting).toHaveBeenCalledWith(true)
    expect(opts.setError).toHaveBeenCalledWith(null)
  })

  it('navigates to quiz page after discarding', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleDiscardSession(opts)
    expect(opts.router.push).toHaveBeenCalledWith('/app/quiz')
  })

  it('shows error and stops loading when discard fails', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'already discarded' })
    const opts = makeOpts()
    await handleDiscardSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('already discarded')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
  })

  it('shows error and stops loading when discard throws unexpectedly', async () => {
    mockDiscardQuiz.mockRejectedValue(new Error('network failure'))
    const opts = makeOpts()
    await handleDiscardSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
  })

  it('includes draft id when discarding', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const opts = makeOpts({ draftId: DRAFT_ID })
    await handleDiscardSession(opts)
    expect(mockDiscardQuiz).toHaveBeenCalledWith(expect.objectContaining({ draftId: DRAFT_ID }))
  })
})

// ---- discardQuizSession — clearActiveSession calls -----------------------

describe('discardQuizSession', () => {
  it('clears active session before calling the discard Server Action', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const mockRouter = { push: mockRouterPush }

    await import('./quiz-submit').then(({ discardQuizSession }) =>
      discardQuizSession(SESSION_ID, mockRouter as never, USER_ID),
    )

    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })

  it('clears active session even when the discard Server Action fails', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'already discarded' })
    const mockRouter = { push: mockRouterPush }

    await import('./quiz-submit').then(({ discardQuizSession }) =>
      discardQuizSession(SESSION_ID, mockRouter as never, USER_ID),
    )

    // clearActiveSession is called before the Server Action — discard intent is respected
    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })
})
