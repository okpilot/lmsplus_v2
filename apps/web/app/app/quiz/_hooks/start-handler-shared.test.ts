import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetActivePracticeSession } = vi.hoisted(() => ({
  mockGetActivePracticeSession: vi.fn(),
}))

vi.mock('../actions/get-active-practice-session', () => ({
  getActivePracticeSession: (...args: unknown[]) => mockGetActivePracticeSession(...args),
}))

import { failStart, reportStartFailure } from './start-handler-shared'

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- failStart -------------------------------------------------------------

describe('failStart', () => {
  it('surfaces the message and stops the loading indicator', () => {
    const setLoading = vi.fn()
    const setError = vi.fn()
    failStart({ setLoading, setError, inFlight: { current: true } }, 'Nothing available')
    expect(setError).toHaveBeenCalledWith('Nothing available')
    expect(setLoading).toHaveBeenCalledWith(false)
  })

  it('lets the user try again after a failure', () => {
    const inFlight = { current: true }
    failStart({ setLoading: vi.fn(), setError: vi.fn(), inFlight }, 'Nothing available')
    expect(inFlight.current).toBe(false)
  })
})

// ---- reportStartFailure ------------------------------------------------------

function makeState() {
  return {
    setLoading: vi.fn(),
    setError: vi.fn(),
    setBlocked: vi.fn(),
    inFlight: { current: true },
  }
}

describe('reportStartFailure', () => {
  it('shows the message without looking up a blocker when the start was not blocked', async () => {
    const state = makeState()
    await reportStartFailure(state, { error: 'No questions available' })
    expect(state.setError).toHaveBeenCalledWith('No questions available')
    expect(mockGetActivePracticeSession).not.toHaveBeenCalled()
    expect(state.setBlocked).not.toHaveBeenCalled()
    expect(state.inFlight.current).toBe(false)
  })

  it('offers to save the open practice quiz when the start is blocked by one', async () => {
    mockGetActivePracticeSession.mockResolvedValue({
      success: true,
      session: { sessionId: 'blocker-1', subjectName: 'Air Law' },
    })
    const state = makeState()
    await reportStartFailure(state, { error: 'Another session is active', blocked: true })
    expect(state.setBlocked).toHaveBeenCalledWith({
      sessionId: 'blocker-1',
      subjectName: 'Air Law',
    })
    expect(state.setError).toHaveBeenCalledWith('Another session is active')
    expect(state.inFlight.current).toBe(false)
  })

  it('offers nothing when the blocker is not a practice session', async () => {
    mockGetActivePracticeSession.mockResolvedValue({ success: true, session: null })
    const state = makeState()
    await reportStartFailure(state, { error: 'Another session is active', blocked: true })
    expect(state.setBlocked).not.toHaveBeenCalled()
    expect(state.setError).toHaveBeenCalledWith('Another session is active')
  })

  it('still shows the message when the blocker lookup fails', async () => {
    mockGetActivePracticeSession.mockRejectedValue(new Error('network'))
    const state = makeState()
    await reportStartFailure(state, { error: 'Another session is active', blocked: true })
    expect(state.setBlocked).not.toHaveBeenCalled()
    expect(state.setError).toHaveBeenCalledWith('Another session is active')
    expect(state.inFlight.current).toBe(false)
  })
})
