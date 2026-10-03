import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClaim } = vi.hoisted(() => ({ mockClaim: vi.fn() }))

vi.mock('../../actions/quiz-progress', () => ({
  claimQuizSession: (...a: unknown[]) => mockClaim(...a),
}))

import { CLAIM_TIMEOUT_MS, claimQuizDeviceBounded, withTakeoverCheck } from './claim-quiz-device'
import { _resetQuizDeviceId } from './quiz-device-id'
import { _resetSessionTakeover, isTakenOver, markTakenOver } from './session-takeover'

class FakeChannel {
  static posted: unknown[] = []
  postMessage(m: unknown) {
    FakeChannel.posted.push(m)
  }
  close() {}
}

const MAPPED = 'This session has already ended.'

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  _resetQuizDeviceId()
  _resetSessionTakeover()
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  FakeChannel.posted.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('claimQuizDeviceBounded', () => {
  it('claims the session with this tab device id and resolves null on success', async () => {
    mockClaim.mockResolvedValue({ success: true })
    await expect(claimQuizDeviceBounded('sess-1')).resolves.toBeNull()
    expect(mockClaim).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      deviceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
  })

  it('resolves the mapped copy for a displayable failure', async () => {
    mockClaim.mockResolvedValue({ success: false, error: MAPPED })
    await expect(claimQuizDeviceBounded('s')).resolves.toBe(MAPPED)
  })

  it('resolves null and warns for an unmapped failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockClaim.mockResolvedValue({ success: false, error: 'Could not save progress' })
    await expect(claimQuizDeviceBounded('s')).resolves.toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('resolves null when the claim call rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockClaim.mockRejectedValue(new Error('offline'))
    await expect(claimQuizDeviceBounded('s')).resolves.toBeNull()
  })

  it('resolves null after the timeout when the claim hangs', async () => {
    vi.useFakeTimers()
    mockClaim.mockReturnValue(new Promise(() => {}))
    const pending = claimQuizDeviceBounded('s')
    await vi.advanceTimersByTimeAsync(CLAIM_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
  })
})

describe('withTakeoverCheck', () => {
  const TAKEN = 'This quiz is open in another tab or device — reload this page to continue here.'
  const taken = { success: false as const, error: TAKEN }

  it('marks the session taken over without claiming it back when this tab claim had failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockClaim.mockResolvedValue({ success: false, error: 'Could not save progress' })
    await claimQuizDeviceBounded('s')
    const call = vi.fn().mockResolvedValue(taken)
    await expect(withTakeoverCheck('s', call)).resolves.toEqual(taken)
    expect(mockClaim).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledTimes(1)
    expect(isTakenOver('s')).toBe(true)
  })

  it('marks the session taken over when this tab claim succeeded', async () => {
    mockClaim.mockResolvedValue({ success: true })
    await claimQuizDeviceBounded('s')
    await expect(withTakeoverCheck('s', vi.fn().mockResolvedValue(taken))).resolves.toEqual(taken)
    expect(isTakenOver('s')).toBe(true)
  })

  it('passes non-takeover failures through without marking a takeover', async () => {
    const failure = { success: false as const, error: MAPPED }
    await expect(withTakeoverCheck('s', vi.fn().mockResolvedValue(failure))).resolves.toEqual(
      failure,
    )
    expect(isTakenOver('s')).toBe(false)
  })

  it('does not mark a takeover on success', async () => {
    await expect(
      withTakeoverCheck('s', vi.fn().mockResolvedValue({ success: true })),
    ).resolves.toEqual({ success: true })
    expect(isTakenOver('s')).toBe(false)
  })
})

describe('claim ownership', () => {
  it('clears the taken-over flag and announces the claim when it succeeds', async () => {
    markTakenOver('s')
    mockClaim.mockResolvedValue({ success: true })
    await claimQuizDeviceBounded('s')
    expect(isTakenOver('s')).toBe(false)
    expect(FakeChannel.posted).toEqual([{ sessionId: 's', deviceId: expect.any(String) }])
  })

  it('clears the taken-over flag when the claim succeeds after the timeout', async () => {
    vi.useFakeTimers()
    markTakenOver('s')
    mockClaim.mockReturnValue(
      new Promise((resolve) =>
        setTimeout(() => resolve({ success: true }), CLAIM_TIMEOUT_MS + 500),
      ),
    )
    const pending = claimQuizDeviceBounded('s')
    await vi.advanceTimersByTimeAsync(CLAIM_TIMEOUT_MS)
    await pending
    expect(isTakenOver('s')).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(isTakenOver('s')).toBe(false)
    expect(FakeChannel.posted).toHaveLength(1)
  })
})
