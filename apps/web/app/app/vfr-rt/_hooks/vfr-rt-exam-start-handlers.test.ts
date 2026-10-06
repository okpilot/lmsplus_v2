import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRouterPush, mockStartVfrRtExam, mockReportStartFailure } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartVfrRtExam: vi.fn(),
  mockReportStartFailure: vi.fn(),
}))

vi.mock('../../vfr-rt-exam/actions/start', () => ({
  startVfrRtExam: (...args: unknown[]) => mockStartVfrRtExam(...args),
}))

vi.mock('@/app/app/quiz/_hooks/start-handler-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/app/quiz/_hooks/start-handler-shared')>()),
  reportStartFailure: (...args: unknown[]) => mockReportStartFailure(...args),
}))

import { createMockRouter } from '@/lib/test-support/mock-router'
import { buildVfrRtExamStartHandler, type VfrRtExamStartDeps } from './vfr-rt-exam-start-handlers'

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const SESSION_ID = '00000000-0000-4000-a000-000000000001'

const SUCCESS_RESULT = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: ['q-1', 'q-2'],
  timeLimitSeconds: 3600,
  parts: { p1End: 1, p2End: 2, p3End: 2 },
  startedAt: '2026-10-05T10:00:00.000Z',
}

function makeDeps(overrides: Partial<VfrRtExamStartDeps> = {}): VfrRtExamStartDeps {
  return {
    subjectId: SUBJECT_ID,
    subjects: [],
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
  mockStartVfrRtExam.mockResolvedValue(SUCCESS_RESULT)
  setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
  getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
})

describe('buildVfrRtExamStartHandler — navigation', () => {
  it('navigates to /app/quiz/session/<id>, never calls sessionStorage.setItem, never reads localStorage', async () => {
    await buildVfrRtExamStartHandler(makeDeps())()

    expect(mockRouterPush).toHaveBeenCalledWith(`/app/quiz/session/${SESSION_ID}`)
    expect(setItemSpy).not.toHaveBeenCalled()
    expect(getItemSpy).not.toHaveBeenCalled()
  })

  it('starts the exam for the selected subject', async () => {
    await buildVfrRtExamStartHandler(makeDeps())()

    expect(mockStartVfrRtExam).toHaveBeenCalledWith({ subjectId: SUBJECT_ID })
  })

  it('clears a previous blocked offer when a new start begins', async () => {
    const deps = makeDeps()
    await buildVfrRtExamStartHandler(deps)()
    expect(deps.setBlocked).toHaveBeenCalledWith(null)
  })

  it('ignores further start attempts after a successful start navigates away', async () => {
    const handleStart = buildVfrRtExamStartHandler(makeDeps())
    await handleStart()
    await handleStart()
    expect(mockStartVfrRtExam).toHaveBeenCalledTimes(1)
    expect(mockRouterPush).toHaveBeenCalledTimes(1)
  })
})

describe('buildVfrRtExamStartHandler — same-tick re-entry', () => {
  it('starts only one session when invoked twice in the same tick', async () => {
    const handleStart = buildVfrRtExamStartHandler(makeDeps())
    await Promise.all([handleStart(), handleStart()])
    expect(mockStartVfrRtExam).toHaveBeenCalledTimes(1)
  })
})

describe('buildVfrRtExamStartHandler — failures', () => {
  it('reports a rejected start, including the blocked flag, and stays on the form', async () => {
    const failure = { success: false as const, error: 'Another session is active', blocked: true }
    mockStartVfrRtExam.mockResolvedValue(failure)
    const deps = makeDeps()

    await buildVfrRtExamStartHandler(deps)()

    expect(mockReportStartFailure).toHaveBeenCalledWith(deps, failure)
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('allows a second attempt after the start throws', async () => {
    mockStartVfrRtExam.mockRejectedValueOnce(new Error('network timeout'))
    const deps = makeDeps()
    const handleStart = buildVfrRtExamStartHandler(deps)

    await handleStart()
    expect(deps.inFlight.current).toBe(false)
    expect(deps.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')

    await handleStart()
    expect(mockStartVfrRtExam).toHaveBeenCalledTimes(2)
  })
})
