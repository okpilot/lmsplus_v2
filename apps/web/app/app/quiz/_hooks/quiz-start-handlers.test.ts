import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRouterPush, mockStartQuizSession, mockReportStartFailure } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartQuizSession: vi.fn(),
  mockReportStartFailure: vi.fn(),
}))

vi.mock('../actions/start', () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
}))

vi.mock('./start-handler-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start-handler-shared')>()),
  reportStartFailure: (...args: unknown[]) => mockReportStartFailure(...args),
}))

import { createMockRouter } from '@/lib/test-support/mock-router'
import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'
import { buildQuizStartHandler, type QuizStartDeps } from './quiz-start-handlers'

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const SESSION_ID = '00000000-0000-4000-a000-000000000001'

const SUCCESS_RESULT = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: ['q-1', 'q-2'],
}

function makeDeps(overrides: Partial<QuizStartDeps> = {}): QuizStartDeps {
  return {
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
    router: createMockRouter({ push: mockRouterPush }),
    loading: false,
    setLoading: vi.fn(),
    setError: vi.fn(),
    setBlocked: vi.fn(),
    inFlight: { current: false },
    ...overrides,
  }
}

let setItemSpy: ReturnType<typeof vi.spyOn>
let getItemSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  mockStartQuizSession.mockResolvedValue(SUCCESS_RESULT)
  setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
  getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
})

describe('buildQuizStartHandler — navigation', () => {
  it('navigates to /app/quiz/session/<id>, never calls sessionStorage.setItem, never reads localStorage', async () => {
    await buildQuizStartHandler(makeDeps())()

    expect(mockRouterPush).toHaveBeenCalledWith(`/app/quiz/session/${SESSION_ID}`)
    expect(setItemSpy).not.toHaveBeenCalled()
    expect(getItemSpy).not.toHaveBeenCalled()
  })

  it('sends the selected subject, count and filters to the start action', async () => {
    await buildQuizStartHandler(makeDeps({ count: 80, maxQuestions: 20 }))()

    expect(mockStartQuizSession).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: SUBJECT_ID, count: 20, filters: ['all'] }),
    )
  })

  it('clears a previous blocked offer when a new start begins', async () => {
    const deps = makeDeps()
    await buildQuizStartHandler(deps)()
    expect(deps.setBlocked).toHaveBeenCalledWith(null)
  })

  it('ignores further start attempts after a successful start navigates away', async () => {
    const handleStart = buildQuizStartHandler(makeDeps())
    await handleStart()
    await handleStart()
    expect(mockStartQuizSession).toHaveBeenCalledTimes(1)
    expect(mockRouterPush).toHaveBeenCalledTimes(1)
  })
})

describe('buildQuizStartHandler — same-tick re-entry', () => {
  it('starts only one session when invoked twice in the same tick', async () => {
    const handleStart = buildQuizStartHandler(makeDeps())
    await Promise.all([handleStart(), handleStart()])
    expect(mockStartQuizSession).toHaveBeenCalledTimes(1)
  })
})

describe('buildQuizStartHandler — failures', () => {
  it('reports a rejected start, including the blocked flag, and stays on the form', async () => {
    const failure = { success: false as const, error: 'Another session is active', blocked: true }
    mockStartQuizSession.mockResolvedValue(failure)
    const deps = makeDeps()

    await buildQuizStartHandler(deps)()

    expect(mockReportStartFailure).toHaveBeenCalledWith(deps, failure)
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('allows a second attempt after the start throws', async () => {
    mockStartQuizSession.mockRejectedValueOnce(new Error('network timeout'))
    const deps = makeDeps()
    const handleStart = buildQuizStartHandler(deps)

    await handleStart()
    expect(deps.inFlight.current).toBe(false)
    expect(deps.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')

    await handleStart()
    expect(mockStartQuizSession).toHaveBeenCalledTimes(2)
  })
})
