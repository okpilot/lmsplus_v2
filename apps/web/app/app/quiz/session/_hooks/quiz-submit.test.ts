import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const {
  mockBatchSubmitQuiz,
  mockSaveQuizForLater,
  mockDiscardQuiz,
  mockRouterPush,
  mockSubmitEmptyExamSession,
} = vi.hoisted(() => ({
  mockBatchSubmitQuiz: vi.fn(),
  mockSaveQuizForLater: vi.fn(),
  mockDiscardQuiz: vi.fn(),
  mockRouterPush: vi.fn(),
  mockSubmitEmptyExamSession: vi.fn(),
}))

vi.mock('../../actions/batch-submit', () => ({
  batchSubmitQuiz: (...args: unknown[]) => mockBatchSubmitQuiz(...args),
}))

vi.mock('../../actions/saved-quiz', () => ({
  saveQuizForLater: (...args: unknown[]) => mockSaveQuizForLater(...args),
}))
vi.mock('../_utils/quiz-device-id', () => ({ getQuizDeviceId: () => DEVICE_ID }))
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
  clearActiveSessionIfCurrent: mockClearActiveSession,
}))

// ---- Subject under test ---------------------------------------------------

import {
  handleDiscardSession,
  handleSaveSession,
  handleSubmitSession,
  submitQuizSession,
} from './quiz-submit'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const Q1_ID = '00000000-0000-4000-a000-000000000011'
const Q2_ID = '00000000-0000-4000-a000-000000000022'
const DEVICE_ID = '00000000-0000-4000-a000-0000000000d1'
const USER_ID = 'test-user-id'

function makeAnswers(
  entries: Array<
    [
      string,
      {
        selectedOptionId?: string
        responseText?: string
        blankAnswers?: { index: number; text: string }[]
        order?: string[]
        mapping?: { zoneId: string; labelId: string }[]
        responseTimeMs: number
      },
    ]
  >,
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

/** A promise whose resolution is controlled externally, for asserting call ordering. */
function makeDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

// ---- Lifecycle -----------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
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

  it('returns failure when batch submission fails', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({
      success: false,
      error: 'session not found',
    })

    const result = await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('session not found')
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

    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })

  it('does not clear active session when submission fails', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({ success: false, error: 'session not found' })

    await submitQuizSession(SESSION_ID, TWO_ANSWERS, USER_ID)

    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('submits a short_answer as a single entry with responseText', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const shortAnswerMap = makeAnswers([[Q1_ID, { responseText: 'Paris', responseTimeMs: 1200 }]])

    await submitQuizSession(SESSION_ID, shortAnswerMap, USER_ID)

    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: [{ questionId: Q1_ID, responseText: 'Paris', responseTimeMs: 1200 }],
    })
  })

  it('submits a dialog_fill as one entry per blank with blankIndex', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const dialogFillMap = makeAnswers([
      [
        Q1_ID,
        {
          blankAnswers: [
            { index: 0, text: 'north' },
            { index: 1, text: 'south' },
          ],
          responseTimeMs: 2500,
        },
      ],
    ])

    await submitQuizSession(SESSION_ID, dialogFillMap, USER_ID)

    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: [
        { questionId: Q1_ID, blankIndex: 0, responseText: 'north', responseTimeMs: 2500 },
        { questionId: Q1_ID, blankIndex: 1, responseText: 'south', responseTimeMs: 2500 },
      ],
    })
  })

  it('submits an ordering answer as one entry per slot with the item id and slot position', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const orderingMap = makeAnswers([
      [Q1_ID, { order: ['item-c', 'item-a', 'item-b'], responseTimeMs: 4000 }],
    ])

    await submitQuizSession(SESSION_ID, orderingMap, USER_ID)

    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: [
        { questionId: Q1_ID, selectedOptionId: 'item-c', blankIndex: 0, responseTimeMs: 4000 },
        { questionId: Q1_ID, selectedOptionId: 'item-a', blankIndex: 1, responseTimeMs: 4000 },
        { questionId: Q1_ID, selectedOptionId: 'item-b', blankIndex: 2, responseTimeMs: 4000 },
      ],
    })
  })

  it('emits no rows for an ordering question with an empty order', async () => {
    // fanOutOrderingAnswer maps `(a.order ?? [])` — an empty array fans out to zero
    // entries. The defensive Array.isArray(a.order) branch in fanOutAnswer routes
    // ordering BEFORE the MC default, so an empty order must NOT produce a bogus
    // `{ selectedOptionId: undefined }` row.
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const emptyOrderMap = makeAnswers([[Q1_ID, { order: [], responseTimeMs: 2000 }]])

    await submitQuizSession(SESSION_ID, emptyOrderMap, USER_ID)

    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: [],
    })
  })

  it('submits a diagram_label answer as one entry per placed zone with the label/zone ids inverted', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const diagramMap = makeAnswers([
      [
        Q1_ID,
        {
          mapping: [
            { zoneId: 'z1', labelId: 'l1' },
            { zoneId: 'z2', labelId: 'l2' },
          ],
          responseTimeMs: 3000,
        },
      ],
    ])

    await submitQuizSession(SESSION_ID, diagramMap, USER_ID)

    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: [
        {
          questionId: Q1_ID,
          selectedOptionId: 'l1',
          responseText: 'z1',
          blankIndex: 0,
          responseTimeMs: 3000,
        },
        {
          questionId: Q1_ID,
          selectedOptionId: 'l2',
          responseText: 'z2',
          blankIndex: 1,
          responseTimeMs: 3000,
        },
      ],
    })
  })

  it('emits no rows for a diagram_label question with an empty mapping', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const emptyMappingMap = makeAnswers([[Q1_ID, { mapping: [], responseTimeMs: 2000 }]])

    await submitQuizSession(SESSION_ID, emptyMappingMap, USER_ID)

    expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      answers: [],
    })
  })
})

// ---- handleSubmitSession -------------------------------------------------

describe('handleSubmitSession', () => {
  function makeOpts(overrides?: Partial<Parameters<typeof handleSubmitSession>[0]>) {
    return {
      userId: USER_ID,
      sessionId: SESSION_ID,
      answers: TWO_ANSWERS,
      router: makeRouter() as never,
      setSubmitting: vi.fn(),
      setError: vi.fn(),
      onSuccess: vi.fn(),
      ...overrides,
    }
  }

  it('shows an error and lets the student retry when there are no answers to submit', async () => {
    const opts = makeOpts({ answers: new Map() })
    await handleSubmitSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('No answers to submit.')
    expect(opts.setSubmitting).toHaveBeenCalledWith(false)
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

  it('navigates to /app/internal-exam/report after a successful internal-exam submission', async () => {
    mockBatchSubmitQuiz.mockResolvedValue(BATCH_SUCCESS)
    const opts = makeOpts({ isExam: true, examMode: 'internal_exam' })
    await handleSubmitSession(opts)
    expect(opts.router.push).toHaveBeenCalledWith(`/app/internal-exam/report?session=${SESSION_ID}`)
  })

  it('does not navigate on a zero-answer exam until deployment-pin cleanup has settled', async () => {
    const deferred = makeDeferred<undefined>()
    mockClearDeploymentPin.mockReturnValue(deferred.promise)
    const opts = makeOpts({ answers: new Map(), isExam: true, examMode: 'internal_exam' })

    const pending = handleSubmitSession(opts)
    await Promise.resolve()
    await Promise.resolve()
    expect(opts.router.push).not.toHaveBeenCalled()

    deferred.resolve(undefined)
    await pending
    expect(opts.router.push).toHaveBeenCalledWith(`/app/internal-exam/report?session=${SESSION_ID}`)
  })

  it('navigates to /app/internal-exam/report on zero-answer internal-exam timeout', async () => {
    const opts = makeOpts({ answers: new Map(), isExam: true, examMode: 'internal_exam' })
    await handleSubmitSession(opts)
    expect(opts.router.push).toHaveBeenCalledWith(`/app/internal-exam/report?session=${SESSION_ID}`)
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
    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })

  it('fires clearDeploymentPin on successful zero-answer exam completion', async () => {
    const opts = makeOpts({ answers: new Map(), isExam: true })
    await handleSubmitSession(opts)
    expect(mockClearDeploymentPin).toHaveBeenCalledTimes(1)
  })

  it('fires clearDeploymentPin when submitEmptyExamSession fails so the next session is not blocked', async () => {
    mockSubmitEmptyExamSession.mockResolvedValue({ success: false, error: 'Session not found.' })
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const opts = makeOpts({ answers: new Map(), isExam: true })
      await handleSubmitSession(opts)
      expect(mockClearDeploymentPin).toHaveBeenCalledTimes(1)
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('fires clearDeploymentPin when submitEmptyExamSession rejects so the next session is not blocked', async () => {
    mockSubmitEmptyExamSession.mockRejectedValue(new Error('network'))
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const opts = makeOpts({ answers: new Map(), isExam: true })
      await handleSubmitSession(opts)
      expect(mockClearDeploymentPin).toHaveBeenCalledTimes(1)
    } finally {
      consoleSpy.mockRestore()
    }
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
    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
    expect(mockDiscardQuiz).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
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
    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
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
      expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
      expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
      expect(opts.router.push).toHaveBeenCalledWith('/app/quiz')
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
      expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
      expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
      expect(opts.router.push).toHaveBeenCalledWith('/app/quiz')
      expect(opts.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')
      expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
      expect(mockDiscardQuiz).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
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
      router: makeRouter() as never,
      setSubmitting: vi.fn(),
      setError: vi.fn(),
      ...overrides,
    }
  }

  it('parks the quiz on the same session id for this device', async () => {
    mockSaveQuizForLater.mockResolvedValue({ success: true })
    await handleSaveSession(makeOpts())
    expect(mockSaveQuizForLater).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      deviceId: DEVICE_ID,
    })
  })

  it('shows loading state before saving', async () => {
    mockSaveQuizForLater.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.setSubmitting).toHaveBeenCalledWith(true)
    expect(opts.setError).toHaveBeenCalledWith(null)
  })

  it('returns to the quiz list when the save succeeds', async () => {
    mockSaveQuizForLater.mockResolvedValue({ success: true })
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.router.push).toHaveBeenCalledWith('/app/quiz')
    const errorStrings = (opts.setError as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([v]) => v !== null,
    )
    expect(errorStrings).toHaveLength(0)
  })

  it('does not navigate until deployment-pin cleanup has settled', async () => {
    mockSaveQuizForLater.mockResolvedValue({ success: true })
    const deferred = makeDeferred<undefined>()
    mockClearDeploymentPin.mockReturnValue(deferred.promise)
    const opts = makeOpts()
    const pending = handleSaveSession(opts)
    await Promise.resolve()
    await Promise.resolve()
    expect(opts.router.push).not.toHaveBeenCalled()
    deferred.resolve(undefined)
    await pending
    expect(opts.router.push).toHaveBeenCalledWith('/app/quiz')
  })

  it('shows the mapped error, stays on the quiz and stops loading when the save fails', async () => {
    mockSaveQuizForLater.mockResolvedValue({
      success: false,
      error: 'This session has already ended.',
    })
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('This session has already ended.')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
    expect(opts.router.push).not.toHaveBeenCalled()
  })

  it('shows a generic error and stays when the save rejects', async () => {
    mockSaveQuizForLater.mockRejectedValue(new Error('network'))
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
    expect(opts.router.push).not.toHaveBeenCalled()
  })
})

// ---- handleDiscardSession ------------------------------------------------

describe('handleDiscardSession', () => {
  function makeOpts(overrides?: Partial<Parameters<typeof handleDiscardSession>[0]>) {
    return {
      userId: USER_ID,
      sessionId: SESSION_ID,
      router: makeRouter() as never,
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
})

// ---- discardQuizSession — clearActiveSessionIfCurrent calls -----------------------

describe('discardQuizSession', () => {
  it('clears active session before calling the discard Server Action', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const mockRouter = { push: mockRouterPush }

    await import('./quiz-submit').then(({ discardQuizSession }) =>
      discardQuizSession(SESSION_ID, mockRouter as never, USER_ID),
    )

    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })

  it('clears active session even when the discard Server Action fails', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'already discarded' })
    const mockRouter = { push: mockRouterPush }

    await import('./quiz-submit').then(({ discardQuizSession }) =>
      discardQuizSession(SESSION_ID, mockRouter as never, USER_ID),
    )

    // clearActiveSessionIfCurrent is called before the Server Action — discard intent is respected
    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })
})
