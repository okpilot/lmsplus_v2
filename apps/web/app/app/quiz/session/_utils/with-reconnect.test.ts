import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClassify } = vi.hoisted(() => ({ mockClassify: vi.fn() }))

vi.mock('./classify-failure', () => ({
  classifyFailure: (...a: unknown[]) => mockClassify(...a),
}))

import { SIGN_IN } from '../../actions/progress-error-messages'
import {
  _resetConnectionState,
  getConnectionSnapshot,
  getConnectionStatus,
} from './connection-state'
import { _resetWithReconnect, BACKOFF_MS, withReconnect } from './with-reconnect'

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

describe('withReconnect', () => {
  it('passes a successful result through without touching the status', async () => {
    const fn = vi.fn().mockResolvedValue(OK)
    await expect(withReconnect(fn)).resolves.toBe(OK)
    expect(getConnectionSnapshot()).toEqual({ status: 'ok', pending: 0 })
    expect(mockClassify).not.toHaveBeenCalled()
  })

  it('passes a server rejection result through without blocking', async () => {
    const failure = { success: false as const, error: 'This session has already ended.' }
    await expect(withReconnect(async () => failure)).resolves.toBe(failure)
    expect(getConnectionStatus()).toBe('ok')
  })

  it('blocks as offline on a network failure and resends after the first backoff', async () => {
    mockClassify.mockResolvedValue('offline')
    const fn = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(OK)
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionSnapshot()).toEqual({ status: 'offline', pending: 1 })
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await expect(result).resolves.toBe(OK)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(getConnectionSnapshot()).toEqual({ status: 'saved', pending: 0 })
  })

  it('resends immediately when the online event fires before the backoff ends', async () => {
    mockClassify.mockResolvedValue('offline')
    const fn = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(OK)
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('online'))
    await expect(result).resolves.toBe(OK)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('backs off 2s, 4s, 8s and then caps at 10s between resend attempts', async () => {
    mockClassify.mockResolvedValue('offline')
    const fn = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    void withReconnect(fn)
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(1)
    let calls = 1
    for (const delay of [2000, 4000, 8000, 10000, 10000]) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(fn).toHaveBeenCalledTimes(calls)
      await vi.advanceTimersByTimeAsync(1)
      calls += 1
      expect(fn).toHaveBeenCalledTimes(calls)
    }
  })

  it('resends queued operations one at a time in the order they were issued', async () => {
    mockClassify.mockResolvedValue('offline')
    const order: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const make = (name: string, failFirst: boolean) => {
      let failed = !failFirst
      return async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await Promise.resolve()
        inFlight -= 1
        if (!failed) {
          failed = true
          throw new TypeError('fetch failed')
        }
        order.push(name)
        return OK
      }
    }
    const a = withReconnect(make('a', true))
    const b = withReconnect(make('b', true))
    await vi.advanceTimersByTimeAsync(0)
    maxInFlight = 0
    const c = withReconnect(make('c', false))
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await Promise.all([a, b, c])
    expect(order).toEqual(['a', 'b', 'c'])
    expect(maxInFlight).toBe(1)
    expect(getConnectionSnapshot()).toEqual({ status: 'saved', pending: 0 })
  })

  it('keeps the status offline until the last queued operation lands', async () => {
    mockClassify.mockResolvedValue('offline')
    const gate: { release: () => void } = { release: () => {} }
    const slow = new Promise<typeof OK>((resolve) => {
      gate.release = () => resolve(OK)
    })
    const first = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValue(OK)
    const second = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockReturnValue(slow)
    const a = withReconnect(first)
    const b = withReconnect(second)
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await a
    expect(getConnectionSnapshot()).toEqual({ status: 'offline', pending: 1 })
    gate.release()
    await b
    expect(getConnectionStatus()).toBe('saved')
  })

  it('resolves a sign-in failure and sets signed-out when the sign-in expired', async () => {
    mockClassify.mockResolvedValue('signed-out')
    const result = await withReconnect(async () => ({ success: false as const, error: SIGN_IN }))
    expect(result).toEqual({ success: false, error: SIGN_IN })
    expect(getConnectionStatus()).toBe('signed-out')
  })

  it('answers later calls with a sign-in failure without calling the action again', async () => {
    mockClassify.mockResolvedValue('signed-out')
    await withReconnect(async () => ({ success: false as const, error: SIGN_IN }))
    const fn = vi.fn().mockResolvedValue(OK)
    await expect(withReconnect(fn)).resolves.toEqual({ success: false, error: SIGN_IN })
    expect(fn).not.toHaveBeenCalled()
  })

  it('turns an expired sign-in found during a resend into a sign-in failure', async () => {
    mockClassify.mockResolvedValueOnce('offline').mockResolvedValueOnce('signed-out')
    const fn = vi.fn().mockRejectedValue(new TypeError('x'))
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await expect(result).resolves.toEqual({ success: false, error: SIGN_IN })
    expect(getConnectionSnapshot()).toEqual({ status: 'signed-out', pending: 0 })
  })

  it('rethrows a server error and clears the offline block when a resend hits one', async () => {
    mockClassify.mockResolvedValueOnce('offline').mockResolvedValueOnce('server')
    const boom = new Error('server exploded')
    const fn = vi.fn().mockRejectedValue(boom)
    const result = withReconnect(fn)
    const assertion = expect(result).rejects.toBe(boom)
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await assertion
    expect(getConnectionSnapshot()).toEqual({ status: 'ok', pending: 0 })
  })

  it('rethrows a server error on the first attempt as today', async () => {
    mockClassify.mockResolvedValue('server')
    const boom = new Error('server exploded')
    await expect(withReconnect(() => Promise.reject(boom))).rejects.toBe(boom)
    expect(getConnectionStatus()).toBe('ok')
  })

  it('returns a malformed non-error result unchanged when the user is still signed in', async () => {
    mockClassify.mockResolvedValue('server')
    await expect(withReconnect(async () => ({}) as { success: boolean })).resolves.toEqual({})
  })
})
