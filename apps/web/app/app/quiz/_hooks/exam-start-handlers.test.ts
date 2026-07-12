import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockStartExamSession, mockSessionStorageSetItem, mockDiscardQuiz } =
  vi.hoisted(() => ({
    mockRouterPush: vi.fn(),
    mockStartExamSession: vi.fn(),
    mockSessionStorageSetItem: vi.fn(),
    mockDiscardQuiz: vi.fn(),
  }))

vi.mock('../actions/start-exam', () => ({
  startExamSession: (...args: unknown[]) => mockStartExamSession(...args),
}))

vi.mock('../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))

const { mockReadActiveSession, mockClearActiveSession } = vi.hoisted(() => ({
  mockReadActiveSession: vi.fn(),
  mockClearActiveSession: vi.fn(),
}))

vi.mock('../session/_utils/quiz-session-storage', () => ({
  readActiveSession: () => mockReadActiveSession(),
  clearActiveSession: mockClearActiveSession,
}))
vi.mock('../session/_utils/quiz-session-handoff', () => ({
  sessionHandoffKey: (userId: string) => `quiz-session:${userId}`,
}))

// ---- Subject under test ---------------------------------------------------

import { buildExamStartHandler, type ExamStartDeps } from './exam-start-handlers'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const SESSION_ID = '00000000-0000-4000-a000-000000000001'

const SUCCESS_RESULT = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: ['q-1', 'q-2'],
  totalQuestions: 2,
  timeLimitSeconds: 3600,
  passMark: 75,
  startedAt: '2026-04-27T12:00:00.000Z',
}

const EXISTING_SESSION = {
  sessionId: 'old-sess',
  questionIds: ['q9'],
  answers: {},
  currentIndex: 0,
  subjectName: 'Meteorology',
  savedAt: Date.now(),
}

function makeDeps(overrides: Partial<ExamStartDeps> = {}): ExamStartDeps {
  return {
    userId: 'test-user-id',
    subjectId: SUBJECT_ID,
    examSubjects: [
      {
        id: SUBJECT_ID,
        code: '010',
        name: 'Air Law',
        short: 'ALW',
        totalQuestions: 50,
        timeLimitSeconds: 3600,
        passMark: 75,
      },
    ],
    router: { push: mockRouterPush } as unknown as ExamStartDeps['router'],
    loading: false,
    setLoading: vi.fn(),
    setError: vi.fn(),
    inFlight: { current: false },
    ...overrides,
  }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { setItem: mockSessionStorageSetItem, getItem: vi.fn(), removeItem: vi.fn() },
    writable: true,
  })
  mockStartExamSession.mockResolvedValue(SUCCESS_RESULT)
  mockReadActiveSession.mockReturnValue(null)
  mockDiscardQuiz.mockResolvedValue({ success: true })
})

// ---- Same-tick re-entry ----------------------------------------------------

describe('buildExamStartHandler — same-tick re-entry', () => {
  it('starts only one exam when invoked twice in the same tick', async () => {
    const handleStart = buildExamStartHandler(makeDeps())
    const first = handleStart()
    const second = handleStart()
    await Promise.all([first, second])
    expect(mockStartExamSession).toHaveBeenCalledTimes(1)
  })
})

// ---- Confirm cancel stays retryable ----------------------------------------

describe('buildExamStartHandler — confirm cancel stays retryable', () => {
  it('starts the exam on a retry after the user first cancels the confirmation', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const handleStart = buildExamStartHandler(makeDeps())

    await handleStart()
    expect(mockStartExamSession).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await handleStart()
    expect(mockStartExamSession).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })
})

// ---- Retryable failures release the guard ----------------------------------

describe('buildExamStartHandler — retryable failures', () => {
  it('allows a second attempt after the server rejects the start', async () => {
    mockStartExamSession.mockResolvedValue({
      success: false as const,
      error: 'Practice Exam is not configured for this subject.',
    })
    const deps = makeDeps()
    const handleStart = buildExamStartHandler(deps)

    await handleStart()
    await handleStart()

    expect(mockStartExamSession).toHaveBeenCalledTimes(2)
    expect(deps.inFlight.current).toBe(false)
  })

  it('allows a second attempt after the start throws', async () => {
    mockStartExamSession.mockRejectedValue(new Error('network timeout'))
    const deps = makeDeps()
    const handleStart = buildExamStartHandler(deps)

    await handleStart()

    expect(deps.inFlight.current).toBe(false)
    expect(deps.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')

    await handleStart()
    expect(mockStartExamSession).toHaveBeenCalledTimes(2)
  })

  it('discards the orphaned exam and allows a retry when the handoff write fails', async () => {
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const deps = makeDeps()
    const handleStart = buildExamStartHandler(deps)

    await handleStart()

    expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: SESSION_ID })
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(deps.inFlight.current).toBe(false)
    expect(deps.setError).toHaveBeenCalledWith(
      'Unable to start Practice Exam right now. Please try again.',
    )
  })

  it('still allows a retry when the orphan cleanup itself throws', async () => {
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    mockDiscardQuiz.mockRejectedValue(new Error('discard network failure'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const deps = makeDeps()
      const handleStart = buildExamStartHandler(deps)

      await handleStart()

      expect(deps.inFlight.current).toBe(false)
      expect(deps.setError).toHaveBeenCalledWith(
        'Unable to start Practice Exam right now. Please try again.',
      )
    } finally {
      errorSpy.mockRestore()
    }
  })
})

// ---- Terminal success keeps the guard engaged --------------------------------

describe('buildExamStartHandler — terminal success', () => {
  it('ignores further start attempts after a successful start navigates away', async () => {
    const deps = makeDeps()
    const handleStart = buildExamStartHandler(deps)

    await handleStart()
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')

    await handleStart()
    expect(mockStartExamSession).toHaveBeenCalledTimes(1)
    expect(mockRouterPush).toHaveBeenCalledTimes(1)
  })
})
