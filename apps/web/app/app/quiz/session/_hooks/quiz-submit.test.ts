import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockBatchSubmitQuiz, mockDeleteDraft, mockSaveDraft, mockDiscardQuiz, mockRouterPush } =
  vi.hoisted(() => ({
    mockBatchSubmitQuiz: vi.fn(),
    mockDeleteDraft: vi.fn(),
    mockSaveDraft: vi.fn(),
    mockDiscardQuiz: vi.fn(),
    mockRouterPush: vi.fn(),
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

// ---- Subject under test ---------------------------------------------------

import {
  handleDiscardSession,
  handleSaveSession,
  handleSubmitSession,
  saveQuizDraft,
  submitQuizSession,
} from './quiz-submit'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-0000-0000-000000000001'
const Q1_ID = '00000000-0000-0000-0000-000000000011'
const Q2_ID = '00000000-0000-0000-0000-000000000022'

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
})

// ---- submitQuizSession ---------------------------------------------------

describe('submitQuizSession', () => {
  it('returns success result from batchSubmitQuiz on happy path', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)

    const result = await submitQuizSession(SESSION_ID, TWO_ANSWERS)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.totalQuestions).toBe(2)
      expect(result.correctCount).toBe(1)
      expect(result.scorePercentage).toBe(50)
    }
  })

  it('passes answers as an array with correct shape to batchSubmitQuiz', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)

    await submitQuizSession(SESSION_ID, TWO_ANSWERS)

    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: expect.arrayContaining([
        { questionId: Q1_ID, selectedOptionId: 'opt-a', responseTimeMs: 1500 },
        { questionId: Q2_ID, selectedOptionId: 'opt-c', responseTimeMs: 2000 },
      ]),
    })
  })

  it('calls deleteDraft with draftId after a successful submit when draftId is provided', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const DRAFT_ID = '00000000-0000-0000-0000-000000000050'

    await submitQuizSession(SESSION_ID, TWO_ANSWERS, DRAFT_ID)

    expect(mockDeleteDraft).toHaveBeenCalledWith({ draftId: DRAFT_ID })
    expect(mockDeleteDraft).toHaveBeenCalledTimes(1)
  })

  it('does not call deleteDraft when no draftId is provided', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)

    await submitQuizSession(SESSION_ID, TWO_ANSWERS)

    expect(mockDeleteDraft).not.toHaveBeenCalled()
  })

  it('returns failure when batchSubmitQuiz reports an error', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({
      success: false,
      error: 'session not found',
    })

    const result = await submitQuizSession(SESSION_ID, TWO_ANSWERS)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('session not found')
  })

  it('does not call deleteDraft when batchSubmitQuiz fails', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({ success: false, error: 'session not found' })
    const DRAFT_ID = '00000000-0000-0000-0000-000000000050'

    await submitQuizSession(SESSION_ID, TWO_ANSWERS, DRAFT_ID)

    expect(mockDeleteDraft).not.toHaveBeenCalled()
  })

  it('returns generic failure when batchSubmitQuiz throws', async () => {
    mockBatchSubmitQuiz.mockRejectedValue(new Error('network error'))

    const result = await submitQuizSession(SESSION_ID, TWO_ANSWERS)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
  })

  it('handles an empty answers map', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({ success: false, error: 'No answers' })

    const result = await submitQuizSession(SESSION_ID, new Map())

    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: [],
    })
    expect(result.success).toBe(false)
  })

  it('logs via console.error when draft cleanup fails after successful submit', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const cleanupError = new Error('draft cleanup network failure')
    mockDeleteDraft.mockRejectedValue(cleanupError)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const DRAFT_ID = '00000000-0000-0000-0000-000000000050'

    const result = await submitQuizSession(SESSION_ID, TWO_ANSWERS, DRAFT_ID)

    // Submit still succeeds despite cleanup failure
    expect(result.success).toBe(true)

    // Fire-and-forget: give the microtask queue time to reject
    await Promise.resolve()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[submitQuizSession] Draft cleanup failed:',
      cleanupError,
    )
    consoleSpy.mockRestore()
  })
})

// ---- saveQuizDraft -------------------------------------------------------

describe('saveQuizDraft', () => {
  it('calls saveDraft with serialised answers and currentIndex', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    await saveQuizDraft({
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

  it('redirects to /app/quiz when saveDraft succeeds', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    const result = await saveQuizDraft({
      sessionId: SESSION_ID,
      questionIds: [Q1_ID],
      answers: TWO_ANSWERS,
      currentIndex: 0,
      router: makeRouter() as never,
    })

    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz')
    expect(result.success).toBe(true)
  })

  it('returns failure and does not redirect when saveDraft reports an error', async () => {
    mockSaveDraft.mockResolvedValue({ success: false, error: 'Failed to save draft' })

    const result = await saveQuizDraft({
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

  it('converts answers Map to a plain object for saveDraft', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    await saveQuizDraft({
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

  it('forwards subjectName and subjectCode to saveDraft when provided', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    await saveQuizDraft({
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

  it('omits subjectName and subjectCode from saveDraft when not provided', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })

    await saveQuizDraft({
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
})

// ---- handleSubmitSession -------------------------------------------------

describe('handleSubmitSession', () => {
  function makeOpts(overrides?: Partial<Parameters<typeof handleSubmitSession>[0]>) {
    return {
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

  it('sets error and returns early when answers map is empty', async () => {
    const opts = makeOpts({ answers: new Map() })
    await handleSubmitSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('No answers to submit.')
    expect(opts.setSubmitting).not.toHaveBeenCalled()
    expect(mockBatchSubmitQuiz).not.toHaveBeenCalled()
  })

  it('calls onSuccess and navigates to report on successful submit', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const opts = makeOpts()
    await handleSubmitSession(opts)
    expect(opts.onSuccess).toHaveBeenCalledTimes(1)
    expect(opts.router.push).toHaveBeenCalledWith(`/app/quiz/report?session=${SESSION_ID}`)
    expect(opts.setError).toHaveBeenCalledWith(null)
  })

  it('sets error and clears submitting state when submit fails', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({ success: false, error: 'session discarded' })
    const opts = makeOpts()
    await handleSubmitSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('session discarded')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
    expect(opts.onSuccess).not.toHaveBeenCalled()
    expect(opts.router.push).not.toHaveBeenCalled()
  })

  it('sets submitting true and clears error before calling batchSubmitQuiz', async () => {
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
})

// ---- handleSaveSession ---------------------------------------------------

describe('handleSaveSession', () => {
  function makeOpts(overrides?: Partial<Parameters<typeof handleSaveSession>[0]>) {
    return {
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

  it('sets submitting true and clears error before calling saveDraft', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.setSubmitting).toHaveBeenCalledWith(true)
    expect(opts.setError).toHaveBeenCalledWith(null)
  })

  it('does not set error or reset submitting when save succeeds', async () => {
    mockSaveDraft.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleSaveSession(opts)
    // setError(null) from setup, no second call with an error string
    const errorCalls = (opts.setError as ReturnType<typeof vi.fn>).mock.calls
    const errorStrings = errorCalls.filter(([v]) => v !== null)
    expect(errorStrings).toHaveLength(0)
  })

  it('sets error and resets submitting when save fails', async () => {
    mockSaveDraft.mockResolvedValue({ success: false, error: 'draft limit reached' })
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('draft limit reached')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
  })

  it('maps questions array to questionIds for saveDraft', async () => {
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
      sessionId: SESSION_ID,
      router: makeRouter() as never,
      draftId: undefined,
      setSubmitting: vi.fn(),
      setError: vi.fn(),
      ...overrides,
    }
  }

  it('sets submitting true and clears error before discarding', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleDiscardSession(opts)
    expect(opts.setSubmitting).toHaveBeenCalledWith(true)
    expect(opts.setError).toHaveBeenCalledWith(null)
  })

  it('navigates away when discard succeeds', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleDiscardSession(opts)
    expect(opts.router.push).toHaveBeenCalledWith('/app/quiz')
  })

  it('sets error and resets submitting when discard fails', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'already discarded' })
    const opts = makeOpts()
    await handleDiscardSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('already discarded')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
  })

  it('sets error and resets submitting when discardQuiz throws', async () => {
    mockDiscardQuiz.mockRejectedValue(new Error('network failure'))
    const opts = makeOpts()
    await handleDiscardSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
  })

  it('passes draftId through to discardQuiz', async () => {
    const DRAFT_ID = '00000000-0000-0000-0000-000000000050'
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const opts = makeOpts({ draftId: DRAFT_ID })
    await handleDiscardSession(opts)
    expect(mockDiscardQuiz).toHaveBeenCalledWith(expect.objectContaining({ draftId: DRAFT_ID }))
  })
})
