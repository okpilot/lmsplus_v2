import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClaim } = vi.hoisted(() => ({ mockClaim: vi.fn() }))

vi.mock('../../actions/quiz-progress', () => ({
  claimQuizSession: (...a: unknown[]) => mockClaim(...a),
}))

import {
  _resetClaimState,
  CLAIM_TIMEOUT_MS,
  claimQuizDeviceBounded,
  withClaimRetry,
} from './claim-quiz-device'
import { _resetQuizDeviceId } from './quiz-device-id'

const MAPPED = 'This session has already ended.'

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  _resetQuizDeviceId()
  _resetClaimState()
})

afterEach(() => {
  vi.useRealTimers()
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

describe('withClaimRetry', () => {
  const TAKEN = 'This quiz is open in another tab or device — reload this page to continue here.'
  const taken = { success: false as const, error: TAKEN }

  it('retries the call once after re-claiming when this tab claim had failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockClaim
      .mockResolvedValueOnce({ success: false, error: 'Could not save progress' })
      .mockResolvedValueOnce({ success: true })
    await claimQuizDeviceBounded('s')
    const call = vi.fn().mockResolvedValueOnce(taken).mockResolvedValueOnce({ success: true })
    await expect(withClaimRetry('s', call)).resolves.toEqual({ success: true })
    expect(mockClaim).toHaveBeenCalledTimes(2)
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('does not re-claim when this tab claim succeeded', async () => {
    mockClaim.mockResolvedValue({ success: true })
    await claimQuizDeviceBounded('s')
    const call = vi.fn().mockResolvedValue(taken)
    await expect(withClaimRetry('s', call)).resolves.toEqual(taken)
    expect(mockClaim).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('counts a claim that succeeds after the timeout as owned', async () => {
    vi.useFakeTimers()
    mockClaim.mockReturnValue(
      new Promise((resolve) =>
        setTimeout(() => resolve({ success: true }), CLAIM_TIMEOUT_MS + 500),
      ),
    )
    const pending = claimQuizDeviceBounded('s')
    await vi.advanceTimersByTimeAsync(CLAIM_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
    const call = vi.fn().mockResolvedValue(taken)
    const retried = withClaimRetry('s', call)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(retried).resolves.toEqual(taken)
    expect(mockClaim).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('passes non-takeover failures through without re-claiming', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockClaim.mockResolvedValue({ success: false, error: 'Could not save progress' })
    await claimQuizDeviceBounded('s')
    const failure = { success: false as const, error: MAPPED }
    const call = vi.fn().mockResolvedValue(failure)
    await expect(withClaimRetry('s', call)).resolves.toEqual(failure)
    expect(mockClaim).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('does not re-claim for a different session id', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockClaim.mockResolvedValue({ success: false, error: 'Could not save progress' })
    await claimQuizDeviceBounded('s')
    const call = vi.fn().mockResolvedValue(taken)
    await expect(withClaimRetry('other', call)).resolves.toEqual(taken)
    expect(mockClaim).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledTimes(1)
  })
})
