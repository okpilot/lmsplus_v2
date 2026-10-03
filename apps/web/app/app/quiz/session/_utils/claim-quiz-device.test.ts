import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClaim } = vi.hoisted(() => ({ mockClaim: vi.fn() }))

vi.mock('../../actions/quiz-progress', () => ({
  claimQuizSession: (...a: unknown[]) => mockClaim(...a),
}))

import { CLAIM_TIMEOUT_MS, claimQuizDeviceBounded } from './claim-quiz-device'
import { _resetQuizDeviceId } from './quiz-device-id'

const MAPPED = 'This session has already ended.'

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  _resetQuizDeviceId()
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
