import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClassify, mockLinkIsDown } = vi.hoisted(() => ({
  mockClassify: vi.fn(),
  mockLinkIsDown: vi.fn(),
}))

vi.mock('./classify-failure', () => ({
  classifyFailure: (...a: unknown[]) => mockClassify(...a),
  linkIsDown: () => mockLinkIsDown(),
}))

import {
  _resetConnectionState,
  getConnectionSnapshot,
  getConnectionStatus,
  subscribeConnection,
} from './connection-state'
import { _resetWithReconnect, ATTEMPT_TIMEOUT_MS, withReconnect } from './with-reconnect'

const OK = { success: true as const }

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  _resetConnectionState()
  _resetWithReconnect()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('withReconnect slow saves', () => {
  it('shows still-saving instead of offline when a slow request is not on a down link', async () => {
    mockLinkIsDown.mockResolvedValue(false)
    const gate: { release: () => void } = { release: () => {} }
    const slow = new Promise<typeof OK>((resolve) => {
      gate.release = () => resolve(OK)
    })
    const fn = vi.fn().mockReturnValue(slow)
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS)
    expect(getConnectionStatus()).toBe('slow')
    gate.release()
    await expect(result).resolves.toBe(OK)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(getConnectionSnapshot()).toEqual({ status: 'saved', pending: 0 })
  })

  it('leaves the status alone when the request settles while the link is being checked', async () => {
    const gate: { release: () => void; probe: (down: boolean) => void } = {
      release: () => {},
      probe: () => {},
    }
    const slow = new Promise<typeof OK>((resolve) => {
      gate.release = () => resolve(OK)
    })
    mockLinkIsDown.mockReturnValue(
      new Promise<boolean>((resolve) => {
        gate.probe = resolve
      }),
    )
    const result = withReconnect(vi.fn().mockReturnValue(slow))
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS)
    gate.release()
    await vi.advanceTimersByTimeAsync(0)
    gate.probe(true)
    await expect(result).resolves.toBe(OK)
    expect(getConnectionSnapshot()).toEqual({ status: 'ok', pending: 0 })
  })

  it('does not report saved when a request that was only slow later fails the batch', async () => {
    mockLinkIsDown.mockResolvedValue(false)
    mockClassify.mockResolvedValue('server')
    const gate: { fail: () => void } = { fail: () => {} }
    const slow = new Promise<never>((_, reject) => {
      gate.fail = () => reject(new Error('500'))
    })
    const first = withReconnect(vi.fn().mockReturnValue(slow))
    const caught = first.catch(() => {})
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS)
    expect(getConnectionStatus()).toBe('slow')
    gate.fail()
    await caught
    expect(getConnectionStatus()).toBe('ok')
  })

  it('keeps an earlier failure from reading as saved when a slow wait turns offline', async () => {
    mockLinkIsDown.mockResolvedValueOnce(false).mockResolvedValue(true)
    mockClassify.mockResolvedValue('server')
    const slowA = new Promise<typeof OK>((resolve) => setTimeout(() => resolve(OK), 40_000))
    const rejected = { success: false as const, error: 'refused' }
    const a = withReconnect(vi.fn().mockReturnValue(slowA))
    const b = withReconnect(vi.fn().mockResolvedValue(rejected))
    const slowC = () => new Promise<typeof OK>((resolve) => setTimeout(() => resolve(OK), 40_000))
    const c = withReconnect(vi.fn(slowC))
    const seen: string[] = []
    subscribeConnection(() => seen.push(getConnectionStatus()))
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS)
    expect(getConnectionStatus()).toBe('slow')
    await vi.advanceTimersByTimeAsync(90_000)
    await Promise.all([a, b, c])
    expect(seen).not.toContain('saved')
    expect(getConnectionStatus()).toBe('ok')
  })

  it('stays offline when a slow wait finds the link already marked down', async () => {
    mockLinkIsDown.mockResolvedValueOnce(true).mockResolvedValue(false)
    const slowA = new Promise<typeof OK>((resolve) => setTimeout(() => resolve(OK), 40_000))
    const slowB = new Promise<typeof OK>((resolve) => setTimeout(() => resolve(OK), 80_000))
    const a = withReconnect(vi.fn().mockReturnValue(slowA))
    const b = withReconnect(vi.fn().mockReturnValue(slowB))
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS)
    expect(getConnectionStatus()).toBe('offline')
    await vi.advanceTimersByTimeAsync(40_000 + 100)
    expect(getConnectionStatus()).toBe('offline')
    await vi.runAllTimersAsync()
    await Promise.all([a, b])
  })
})
