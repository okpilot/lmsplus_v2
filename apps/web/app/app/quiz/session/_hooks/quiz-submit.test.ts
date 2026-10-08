import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockFinishQuizSession, mockSaveQuizForLater, mockDiscardQuiz, mockRouterReplace } =
  vi.hoisted(() => ({
    mockFinishQuizSession: vi.fn(),
    mockSaveQuizForLater: vi.fn(),
    mockDiscardQuiz: vi.fn(),
    mockRouterReplace: vi.fn(),
  }))

vi.mock('../../actions/finish', () => ({
  finishQuizSession: (...args: unknown[]) => mockFinishQuizSession(...args),
}))

vi.mock('../../actions/saved-quiz', () => ({
  saveQuizForLater: (...args: unknown[]) => mockSaveQuizForLater(...args),
}))
vi.mock('../_utils/quiz-device-id', () => ({ getQuizDeviceId: () => DEVICE_ID }))
vi.mock('../../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
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

import { _resetRunnerExit, isRunnerExiting } from '../_utils/runner-exit'
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

function makeRouter() {
  return { replace: mockRouterReplace }
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
  _resetRunnerExit()
  mockClearDeploymentPin.mockResolvedValue(undefined)
  mockFinishQuizSession.mockResolvedValue({ success: true })
})

// ---- submitQuizSession ---------------------------------------------------

describe('submitQuizSession', () => {
  it('finishes the session on the server for this device and returns success', async () => {
    const result = await submitQuizSession(SESSION_ID, USER_ID)

    expect(result).toEqual({ success: true })
    expect(mockFinishQuizSession).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      deviceId: DEVICE_ID,
    })
  })

  it('returns the action error and keeps the session when the finish fails', async () => {
    mockFinishQuizSession.mockResolvedValue({ success: false, error: 'session not found' })

    const result = await submitQuizSession(SESSION_ID, USER_ID)

    expect(result).toEqual({ success: false, error: 'session not found' })
    expect(mockClearActiveSession).not.toHaveBeenCalled()
    expect(mockClearDeploymentPin).not.toHaveBeenCalled()
    expect(mockDiscardQuiz).not.toHaveBeenCalled()
  })

  it('returns a generic failure when the finish throws unexpectedly', async () => {
    mockFinishQuizSession.mockRejectedValue(new Error('network error'))

    const result = await submitQuizSession(SESSION_ID, USER_ID)

    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('clears the active session from localStorage after a successful finish', async () => {
    await submitQuizSession(SESSION_ID, USER_ID)

    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
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

  it('shows an error and lets the student retry when a practice quiz has no answers', async () => {
    const opts = makeOpts({ answers: new Map() })
    await handleSubmitSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('No answers to submit.')
    expect(opts.setSubmitting).toHaveBeenCalledWith(false)
    expect(mockFinishQuizSession).not.toHaveBeenCalled()
  })

  it('navigates to the report page after a successful finish', async () => {
    const opts = makeOpts()
    await handleSubmitSession(opts)
    expect(opts.onSuccess).toHaveBeenCalledTimes(1)
    expect(opts.router.replace).toHaveBeenCalledWith(`/app/quiz/report?session=${SESSION_ID}`)
    expect(opts.setError).toHaveBeenCalledWith(null)
  })

  it('navigates to /app/internal-exam/report after a successful internal-exam finish', async () => {
    const opts = makeOpts({ isExam: true, examMode: 'internal_exam' })
    await handleSubmitSession(opts)
    expect(opts.router.replace).toHaveBeenCalledWith(
      `/app/internal-exam/report?session=${SESSION_ID}`,
    )
  })

  it('navigates to /app/vfr-rt/report after a successful VFR RT exam finish', async () => {
    const opts = makeOpts({ isExam: true, examMode: 'vfr_rt_exam' })
    await handleSubmitSession(opts)
    expect(opts.router.replace).toHaveBeenCalledWith(`/app/vfr-rt/report?session=${SESSION_ID}`)
  })

  it('does not navigate until deployment-pin cleanup has settled', async () => {
    const deferred = makeDeferred<undefined>()
    mockClearDeploymentPin.mockReturnValue(deferred.promise)
    const opts = makeOpts({ isExam: true, examMode: 'internal_exam' })

    const pending = handleSubmitSession(opts)
    await Promise.resolve()
    await Promise.resolve()
    expect(opts.router.replace).not.toHaveBeenCalled()

    deferred.resolve(undefined)
    await pending
    expect(opts.router.replace).toHaveBeenCalledWith(
      `/app/internal-exam/report?session=${SESSION_ID}`,
    )
  })

  it('finishes an exam with no answers so the student lands on a 0% report', async () => {
    const opts = makeOpts({ answers: new Map(), isExam: true, examMode: 'internal_exam' })
    await handleSubmitSession(opts)
    expect(mockFinishQuizSession).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      deviceId: DEVICE_ID,
    })
    expect(opts.onSuccess).toHaveBeenCalledTimes(1)
    expect(opts.router.replace).toHaveBeenCalledWith(
      `/app/internal-exam/report?session=${SESSION_ID}`,
    )
    expect(mockDiscardQuiz).not.toHaveBeenCalled()
  })

  it('keeps the session, shows the error and lets the student retry when the finish fails', async () => {
    mockFinishQuizSession.mockResolvedValue({ success: false, error: 'session discarded' })
    const opts = makeOpts({ isExam: true, examMode: 'internal_exam' })
    await handleSubmitSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('session discarded')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
    expect(opts.onSuccess).not.toHaveBeenCalled()
    expect(opts.router.replace).not.toHaveBeenCalled()
    expect(mockDiscardQuiz).not.toHaveBeenCalled()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('shows loading state before finishing', async () => {
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
      userId: USER_ID,
      sessionId: SESSION_ID,
      router: makeRouter() as never,
      setSubmitting: vi.fn(),
      setError: vi.fn(),
      ...overrides,
    }
  }

  beforeEach(() => {
    mockSaveQuizForLater.mockResolvedValue({ success: true })
  })

  it('shows loading state before saving', async () => {
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.setSubmitting).toHaveBeenCalledWith(true)
    expect(opts.setError).toHaveBeenCalledWith(null)
  })

  it('parks the server session with this device id', async () => {
    await handleSaveSession(makeOpts())
    expect(mockSaveQuizForLater).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      deviceId: DEVICE_ID,
    })
  })

  it('clears the active session, clears the pin and returns to the quiz list on success', async () => {
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(mockClearDeploymentPin).toHaveBeenCalledTimes(1)
    expect(mockRouterReplace).toHaveBeenCalledWith('/app/quiz')
    expect(opts.setError).not.toHaveBeenCalledWith(expect.any(String))
  })

  it('does not navigate until the pin cleanup has settled', async () => {
    const deferred = makeDeferred<undefined>()
    mockClearDeploymentPin.mockReturnValue(deferred.promise)
    const run = handleSaveSession(makeOpts())
    await Promise.resolve()
    await Promise.resolve()
    expect(mockRouterReplace).not.toHaveBeenCalled()
    deferred.resolve(undefined)
    await run
    expect(mockRouterReplace).toHaveBeenCalledWith('/app/quiz')
  })

  it('releases the leave guards only after the pin cleanup, right before returning to the list', async () => {
    const deferred = makeDeferred<undefined>()
    mockClearDeploymentPin.mockReturnValue(deferred.promise)
    let exitingAtNav: boolean | undefined
    mockRouterReplace.mockImplementation(() => {
      exitingAtNav = isRunnerExiting()
    })
    const run = handleSaveSession(makeOpts())
    await Promise.resolve()
    await Promise.resolve()
    expect(isRunnerExiting()).toBe(false)
    deferred.resolve(undefined)
    await run
    expect(exitingAtNav).toBe(true)
  })

  it('keeps the leave guards armed when the save is refused', async () => {
    mockSaveQuizForLater.mockResolvedValue({ success: false, error: 'Not allowed' })
    await handleSaveSession(makeOpts())
    expect(isRunnerExiting()).toBe(false)
  })

  it('shows the error and stops loading when the save is refused', async () => {
    mockSaveQuizForLater.mockResolvedValue({ success: false, error: 'Not allowed' })
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('Not allowed')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
    expect(mockRouterReplace).not.toHaveBeenCalled()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
  })

  it('shows a generic error and stays on the page when the save throws', async () => {
    mockSaveQuizForLater.mockRejectedValue(new Error('network error'))
    const opts = makeOpts()
    await handleSaveSession(opts)
    expect(opts.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')
    expect(opts.setSubmitting).toHaveBeenLastCalledWith(false)
    expect(mockRouterReplace).not.toHaveBeenCalled()
    expect(mockClearActiveSession).not.toHaveBeenCalled()
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
    expect(opts.router.replace).toHaveBeenCalledWith('/app/quiz')
  })

  it('releases the leave guards before returning to the list after a discard', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    let exitingAtNav: boolean | undefined
    mockRouterReplace.mockImplementation(() => {
      exitingAtNav = isRunnerExiting()
    })
    await handleDiscardSession(makeOpts())
    expect(exitingAtNav).toBe(true)
  })

  it('keeps the leave guards armed when the discard fails', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'already discarded' })
    await handleDiscardSession(makeOpts())
    expect(isRunnerExiting()).toBe(false)
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
    const mockRouter = { replace: mockRouterReplace }

    await import('./quiz-submit').then(({ discardQuizSession }) =>
      discardQuizSession(SESSION_ID, mockRouter as never, USER_ID),
    )

    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })

  it('clears active session even when the discard Server Action fails', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'already discarded' })
    const mockRouter = { replace: mockRouterReplace }

    await import('./quiz-submit').then(({ discardQuizSession }) =>
      discardQuizSession(SESSION_ID, mockRouter as never, USER_ID),
    )

    // clearActiveSessionIfCurrent is called before the Server Action — discard intent is respected
    expect(mockClearActiveSession).toHaveBeenCalledWith(USER_ID, SESSION_ID)
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
  })
})
