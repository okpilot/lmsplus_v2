import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRouterPush, mockStartExamSession, mockReportStartFailure } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartExamSession: vi.fn(),
  mockReportStartFailure: vi.fn(),
}))

vi.mock('../actions/start-exam', () => ({
  startExamSession: (...args: unknown[]) => mockStartExamSession(...args),
}))

vi.mock('./start-handler-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start-handler-shared')>()),
  reportStartFailure: (...args: unknown[]) => mockReportStartFailure(...args),
}))

import { createMockRouter } from '@/lib/test-support/mock-router'
import { buildExamStartHandler, type ExamStartDeps } from './exam-start-handlers'

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const SESSION_ID = '00000000-0000-4000-a000-000000000001'

const SUCCESS_RESULT = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: ['q-1', 'q-2'],
  timeLimitSeconds: 3600,
  passMark: 75,
  startedAt: '2026-10-05T10:00:00.000Z',
}

function makeDeps(overrides: Partial<ExamStartDeps> = {}): ExamStartDeps {
  return {
    subjectId: SUBJECT_ID,
    examSubjects: [],
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
  mockStartExamSession.mockResolvedValue(SUCCESS_RESULT)
  setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
  getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
})

describe('buildExamStartHandler — navigation', () => {
  it('navigates to /app/quiz/session/<id>, never calls sessionStorage.setItem, never reads localStorage', async () => {
    await buildExamStartHandler(makeDeps())()

    expect(mockRouterPush).toHaveBeenCalledWith(`/app/quiz/session/${SESSION_ID}`)
    expect(setItemSpy).not.toHaveBeenCalled()
    expect(getItemSpy).not.toHaveBeenCalled()
  })

  it('starts the exam for the selected subject', async () => {
    await buildExamStartHandler(makeDeps())()

    expect(mockStartExamSession).toHaveBeenCalledWith({ subjectId: SUBJECT_ID })
  })

  it('clears a previous blocked offer when a new start begins', async () => {
    const deps = makeDeps()
    await buildExamStartHandler(deps)()
    expect(deps.setBlocked).toHaveBeenCalledWith(null)
  })

  it('ignores further start attempts after a successful start navigates away', async () => {
    const handleStart = buildExamStartHandler(makeDeps())
    await handleStart()
    await handleStart()
    expect(mockStartExamSession).toHaveBeenCalledTimes(1)
    expect(mockRouterPush).toHaveBeenCalledTimes(1)
  })
})

describe('buildExamStartHandler — same-tick re-entry', () => {
  it('starts only one session when invoked twice in the same tick', async () => {
    const handleStart = buildExamStartHandler(makeDeps())
    await Promise.all([handleStart(), handleStart()])
    expect(mockStartExamSession).toHaveBeenCalledTimes(1)
  })
})

describe('buildExamStartHandler — failures', () => {
  it('reports a rejected start, including the blocked flag, and stays on the form', async () => {
    const failure = { success: false as const, error: 'Another session is active', blocked: true }
    mockStartExamSession.mockResolvedValue(failure)
    const deps = makeDeps()

    await buildExamStartHandler(deps)()

    expect(mockReportStartFailure).toHaveBeenCalledWith(deps, failure)
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('allows a second attempt after the start throws', async () => {
    mockStartExamSession.mockRejectedValueOnce(new Error('network timeout'))
    const deps = makeDeps()
    const handleStart = buildExamStartHandler(deps)

    await handleStart()
    expect(deps.inFlight.current).toBe(false)
    expect(deps.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')

    await handleStart()
    expect(mockStartExamSession).toHaveBeenCalledTimes(2)
  })
})
