import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockStartQuizSession, mockSessionStorageSetItem } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartQuizSession: vi.fn(),
  mockSessionStorageSetItem: vi.fn(),
}))

vi.mock('../actions/start', () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
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

import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'
import { buildQuizStartHandler, type QuizStartDeps } from './quiz-start-handlers'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const SESSION_ID = '00000000-0000-4000-a000-000000000001'

const SUCCESS_RESULT = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: ['q-1', 'q-2'],
}

const EXISTING_SESSION = {
  sessionId: 'old-sess',
  questionIds: ['q9'],
  answers: {},
  currentIndex: 0,
  subjectName: 'Meteorology',
  savedAt: Date.now(),
}

function makeDeps(overrides: Partial<QuizStartDeps> = {}): QuizStartDeps {
  return {
    userId: 'test-user-id',
    subjectId: SUBJECT_ID,
    subjects: [{ id: SUBJECT_ID, code: '010', name: 'Air Law', short: 'ALW', questionCount: 50 }],
    count: 10,
    maxQuestions: 50,
    filters: ['all'] as QuestionFilterValue[],
    calcMode: 'all' as CalcMode,
    imageMode: 'all' as ImageMode,
    topicTree: {
      getSelectedTopicIds: () => [],
      getSelectedSubtopicIds: () => [],
    },
    router: { push: mockRouterPush } as unknown as QuizStartDeps['router'],
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
  mockStartQuizSession.mockResolvedValue(SUCCESS_RESULT)
  mockReadActiveSession.mockReturnValue(null)
})

// ---- Same-tick re-entry ----------------------------------------------------

describe('buildQuizStartHandler — same-tick re-entry', () => {
  it('starts only one session when invoked twice in the same tick', async () => {
    const handleStart = buildQuizStartHandler(makeDeps())
    const first = handleStart()
    const second = handleStart()
    await Promise.all([first, second])
    expect(mockStartQuizSession).toHaveBeenCalledTimes(1)
  })
})

// ---- Confirm cancel stays retryable ----------------------------------------

describe('buildQuizStartHandler — confirm cancel stays retryable', () => {
  it('starts the quiz on a retry after the user first cancels the confirmation', async () => {
    mockReadActiveSession.mockReturnValue(EXISTING_SESSION)
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const handleStart = buildQuizStartHandler(makeDeps())

    await handleStart()
    expect(mockStartQuizSession).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await handleStart()
    expect(mockStartQuizSession).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })
})

// ---- Retryable failures release the guard ----------------------------------

describe('buildQuizStartHandler — retryable failures', () => {
  it('allows a second attempt after the server rejects the start', async () => {
    mockStartQuizSession.mockResolvedValue({ success: false as const, error: 'No questions' })
    const deps = makeDeps()
    const handleStart = buildQuizStartHandler(deps)

    await handleStart()
    await handleStart()

    expect(mockStartQuizSession).toHaveBeenCalledTimes(2)
    expect(deps.inFlight.current).toBe(false)
  })

  it('allows a second attempt after the start throws', async () => {
    mockStartQuizSession.mockRejectedValue(new Error('network timeout'))
    const deps = makeDeps()
    const handleStart = buildQuizStartHandler(deps)

    await handleStart()

    expect(deps.inFlight.current).toBe(false)
    expect(deps.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')

    await handleStart()
    expect(mockStartQuizSession).toHaveBeenCalledTimes(2)
  })

  it('allows a second attempt after the session handoff write fails', async () => {
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const deps = makeDeps()
    const handleStart = buildQuizStartHandler(deps)

    await handleStart()

    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(deps.inFlight.current).toBe(false)
    expect(deps.setError).toHaveBeenCalledWith('Unable to start quiz right now. Please try again.')
  })
})

// ---- Terminal success keeps the guard engaged --------------------------------

describe('buildQuizStartHandler — terminal success', () => {
  it('ignores further start attempts after a successful start navigates away', async () => {
    const deps = makeDeps()
    const handleStart = buildQuizStartHandler(deps)

    await handleStart()
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')

    await handleStart()
    expect(mockStartQuizSession).toHaveBeenCalledTimes(1)
    expect(mockRouterPush).toHaveBeenCalledTimes(1)
  })
})
