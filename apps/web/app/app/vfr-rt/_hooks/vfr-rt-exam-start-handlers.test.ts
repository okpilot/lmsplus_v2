import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockStartVfrRtExam,
  mockReadActiveSession,
  mockClearActiveSession,
  mockWriteActiveSession,
  mockDiscardQuiz,
} = vi.hoisted(() => ({
  mockStartVfrRtExam: vi.fn(),
  mockReadActiveSession: vi.fn(),
  mockClearActiveSession: vi.fn(),
  mockWriteActiveSession: vi.fn(),
  mockDiscardQuiz: vi.fn(),
}))

vi.mock('../../vfr-rt-exam/actions/start', () => ({
  startVfrRtExam: (...args: unknown[]) => mockStartVfrRtExam(...args),
}))
vi.mock('@/app/app/quiz/actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))
vi.mock('@/app/app/quiz/session/_utils/quiz-session-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/app/quiz/session/_utils/quiz-session-storage')>()),
  readActiveSession: () => mockReadActiveSession(),
  clearActiveSession: mockClearActiveSession,
  writeActiveSession: mockWriteActiveSession,
}))

import { createMockRouter } from '@/lib/test-support/mock-router'
import { buildVfrRtExamStartHandler, type VfrRtExamStartDeps } from './vfr-rt-exam-start-handlers'

const SUBJECT_ID = '00000000-0000-4000-a000-000000000010'
const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const HANDOFF_KEY = 'quiz-session:user-1'

const SUCCESS = {
  success: true as const,
  sessionId: SESSION_ID,
  questionIds: ['q-1', 'q-2'],
  timeLimitSeconds: 1800,
  parts: { p1End: 1, p2End: 2, p3End: 2 },
  startedAt: '2026-09-29T12:00:00.000Z',
}

function existingSession(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    sessionId: 'old-sess',
    questionIds: ['q9'],
    answers: {},
    currentIndex: 0,
    subjectName: 'Meteorology',
    savedAt: Date.now(),
    ...overrides,
  }
}

function buildDeps(overrides: Partial<VfrRtExamStartDeps> = {}): VfrRtExamStartDeps {
  return {
    userId: 'user-1',
    subjectId: SUBJECT_ID,
    subjects: [{ id: SUBJECT_ID, code: 'RT', name: 'VFR RT', short: 'RT', questionCount: 3 }],
    router: createMockRouter(),
    loading: false,
    setLoading: vi.fn(),
    setError: vi.fn(),
    inFlight: { current: false },
    ...overrides,
  }
}

function handoff() {
  return JSON.parse(sessionStorage.getItem(HANDOFF_KEY) ?? 'null')
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  mockReadActiveSession.mockReturnValue(null)
  mockStartVfrRtExam.mockResolvedValue(SUCCESS)
})

describe('buildVfrRtExamStartHandler', () => {
  it('starts the exam for the RT subject and navigates to the session runner last', async () => {
    const deps = buildDeps()

    await buildVfrRtExamStartHandler(deps)()

    expect(mockStartVfrRtExam).toHaveBeenCalledWith({ subjectId: SUBJECT_ID })
    expect(deps.router.push).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('hands the exam session to the shared runner as a vfr_rt_exam exam', async () => {
    await buildVfrRtExamStartHandler(buildDeps())()

    expect(handoff()).toEqual({
      userId: 'user-1',
      sessionId: SESSION_ID,
      questionIds: ['q-1', 'q-2'],
      subjectName: 'VFR RT',
      subjectCode: 'RT',
      mode: 'exam',
      examMode: 'vfr_rt_exam',
      timeLimitSeconds: 1800,
      passMark: 75,
      startedAt: '2026-09-29T12:00:00.000Z',
    })
  })

  it('seeds the local active session so a reload before the first answer can resume', async () => {
    await buildVfrRtExamStartHandler(buildDeps())()

    expect(mockWriteActiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        questionIds: ['q-1', 'q-2'],
        answers: {},
        currentIndex: 0,
        mode: 'exam',
        examMode: 'vfr_rt_exam',
        timeLimitSeconds: 1800,
        startedAt: '2026-09-29T12:00:00.000Z',
      }),
    )
  })

  it('shows the mapped error and stays retryable when the start fails', async () => {
    mockStartVfrRtExam.mockResolvedValue({ success: false, error: 'No exam configured' })
    const deps = buildDeps()

    await buildVfrRtExamStartHandler(deps)()

    expect(deps.setError).toHaveBeenLastCalledWith('No exam configured')
    expect(deps.inFlight.current).toBe(false)
    expect(deps.router.push).not.toHaveBeenCalled()
    expect(handoff()).toBeNull()
  })

  it('shows a generic error and stays retryable when the action throws', async () => {
    mockStartVfrRtExam.mockRejectedValue(new Error('network'))
    const deps = buildDeps()

    await buildVfrRtExamStartHandler(deps)()

    expect(deps.setError).toHaveBeenLastCalledWith('Something went wrong. Please try again.')
    expect(deps.inFlight.current).toBe(false)
  })

  it('does not start a second time while one is in flight', async () => {
    await buildVfrRtExamStartHandler(buildDeps({ inFlight: { current: true } }))()

    expect(mockStartVfrRtExam).not.toHaveBeenCalled()
  })

  it('keeps the in-flight lock engaged after a successful start', async () => {
    const deps = buildDeps()

    await buildVfrRtExamStartHandler(deps)()

    expect(deps.inFlight.current).toBe(true)
  })

  it('stays retryable and does nothing when the overwrite confirm is cancelled', async () => {
    mockReadActiveSession.mockReturnValue(existingSession())
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const deps = buildDeps()

    await buildVfrRtExamStartHandler(deps)()

    expect(mockStartVfrRtExam).not.toHaveBeenCalled()
    expect(deps.inFlight.current).toBe(false)
  })

  it('clears an unrelated unfinished session after the overwrite is confirmed', async () => {
    mockReadActiveSession.mockReturnValue(existingSession())
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)

    await buildVfrRtExamStartHandler(buildDeps())()

    expect(mockClearActiveSession).toHaveBeenCalledWith('user-1')
    expect(mockDiscardQuiz).not.toHaveBeenCalled()
  })

  it('resumes the same exam without a confirm and carries the local answers into the handoff', async () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm')
    mockReadActiveSession.mockReturnValue(
      existingSession({
        sessionId: SESSION_ID,
        examMode: 'vfr_rt_exam',
        answers: { 'q-1': { selectedOptionId: 'a', responseTimeMs: 5 } },
        currentIndex: 1,
      }),
    )
    const deps = buildDeps()

    await buildVfrRtExamStartHandler(deps)()

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(handoff()).toMatchObject({
      sessionId: SESSION_ID,
      draftAnswers: { 'q-1': { selectedOptionId: 'a', responseTimeMs: 5 } },
      draftCurrentIndex: 1,
    })
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    expect(mockWriteActiveSession).not.toHaveBeenCalled()
    expect(deps.router.push).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('fails without navigating when the handoff cannot be written', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const deps = buildDeps()

    await buildVfrRtExamStartHandler(deps)()

    expect(deps.setError).toHaveBeenLastCalledWith(
      'Unable to start the exam right now. Please try again.',
    )
    expect(deps.router.push).not.toHaveBeenCalled()
    expect(mockDiscardQuiz).not.toHaveBeenCalled()
  })
})
