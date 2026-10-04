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
import {
  _resetWithReconnect,
  ATTEMPT_TIMEOUT_MS,
  BACKOFF_MS,
  withReconnect,
} from './with-reconnect'

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

  it('resends a call that threw a TypeError even when the link already recovered', async () => {
    mockClassify.mockImplementation(async (thrown?: unknown) =>
      thrown instanceof TypeError ? 'offline' : 'server',
    )
    const fn = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(OK)
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await expect(result).resolves.toBe(OK)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('stops short-circuiting a thrown TypeError once the first attempt has been resent', async () => {
    mockClassify.mockImplementation(async (thrown?: unknown) =>
      thrown instanceof TypeError ? 'offline' : 'server',
    )
    const bug = new TypeError('client bug')
    const fn = vi.fn().mockRejectedValue(bug)
    const result = withReconnect(fn)
    const settled = expect(result).rejects.toBe(bug)
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await settled
    expect(fn).toHaveBeenCalledTimes(2)
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
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
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

  it('keeps the status ok while calls succeed with the link up', async () => {
    const seen: string[] = []
    const a = withReconnect(async () => OK)
    seen.push(getConnectionStatus())
    const b = withReconnect(async () => OK)
    seen.push(getConnectionStatus())
    await Promise.all([a, b])
    expect(seen).toEqual(['ok', 'ok'])
    expect(getConnectionSnapshot()).toEqual({ status: 'ok', pending: 0 })
  })

  it('lands a later call after an earlier one that is still being classified', async () => {
    let releaseProbe: (kind: string) => void = () => {}
    mockClassify.mockReturnValueOnce(new Promise((resolve) => (releaseProbe = resolve)))
    const order: string[] = []
    const first = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('x'))
      .mockImplementation(async () => {
        order.push('first')
        return OK
      })
    const second = vi.fn().mockImplementation(async () => {
      order.push('second')
      return OK
    })
    const a = withReconnect(first)
    const b = withReconnect(second)
    await vi.advanceTimersByTimeAsync(0)
    expect(second).not.toHaveBeenCalled()
    releaseProbe('offline')
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await Promise.all([a, b])
    expect(order).toEqual(['first', 'second'])
  })

  it('does not report saved when the resend is rejected by the server', async () => {
    mockClassify.mockResolvedValue('offline')
    const rejection = { success: false as const, error: 'This session has already ended.' }
    const fn = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValue(rejection)
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await expect(result).resolves.toBe(rejection)
    expect(getConnectionSnapshot()).toEqual({ status: 'ok', pending: 0 })
  })

  it('does not report saved when one call in the batch is rejected', async () => {
    mockClassify.mockResolvedValue('offline')
    const rejection = { success: false as const, error: 'This session has already ended.' }
    const a = withReconnect(
      vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValue(rejection),
    )
    const b = withReconnect(vi.fn().mockResolvedValue(OK))
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await Promise.all([a, b])
    expect(getConnectionSnapshot()).toEqual({ status: 'ok', pending: 0 })
  })

  it('does not report saved when a resend throws a server error inside the batch', async () => {
    mockClassify.mockResolvedValueOnce('offline').mockResolvedValue('server')
    const boom = new Error('server exploded')
    const a = withReconnect(vi.fn().mockRejectedValue(new TypeError('x')).mockRejectedValue(boom))
    const b = withReconnect(vi.fn().mockResolvedValue(OK))
    const assertion = expect(a).rejects.toBe(boom)
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await assertion
    await b
    expect(getConnectionSnapshot()).toEqual({ status: 'ok', pending: 0 })
  })

  it('keeps awaiting a slow request without resending it and returns its result', async () => {
    mockClassify.mockResolvedValue('offline')
    const gate: { release: () => void } = { release: () => {} }
    const slow = new Promise<typeof OK>((resolve) => {
      gate.release = () => resolve(OK)
    })
    const fn = vi.fn().mockReturnValue(slow)
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS)
    expect(getConnectionStatus()).toBe('offline')
    await vi.advanceTimersByTimeAsync(BACKOFF_MS.reduce((a, b) => a + b, 0))
    expect(fn).toHaveBeenCalledTimes(1)
    gate.release()
    await expect(result).resolves.toBe(OK)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(getConnectionSnapshot()).toEqual({ status: 'saved', pending: 0 })
  })

  it('starts a later call only after the slow request ahead of it has landed', async () => {
    const gate: { release: () => void } = { release: () => {} }
    const slow = new Promise<typeof OK>((resolve) => {
      gate.release = () => resolve(OK)
    })
    const first = vi.fn().mockReturnValue(slow)
    const second = vi.fn().mockResolvedValue(OK)
    const a = withReconnect(first)
    const b = withReconnect(second)
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS * 2)
    expect(second).not.toHaveBeenCalled()
    gate.release()
    await Promise.all([a, b])
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('resends a slow request once after it finally fails offline', async () => {
    mockClassify.mockResolvedValue('offline')
    const gate: { fail: () => void } = { fail: () => {} }
    const slow = new Promise<never>((_, reject) => {
      gate.fail = () => reject(new TypeError('fetch failed'))
    })
    const fn = vi.fn().mockReturnValueOnce(slow).mockResolvedValue(OK)
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS)
    expect(fn).toHaveBeenCalledTimes(1)
    gate.fail()
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await expect(result).resolves.toBe(OK)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not resend a stalled request when the browser comes back online', async () => {
    mockClassify.mockResolvedValue('offline')
    const gate: { land: () => void } = { land: () => {} }
    const stalled = new Promise((resolve) => {
      gate.land = () => resolve(OK)
    })
    const fn = vi.fn().mockReturnValueOnce(stalled).mockResolvedValue(OK)
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(getConnectionStatus()).toBe('offline')
    gate.land()
    await expect(result).resolves.toBe(OK)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(getConnectionSnapshot()).toEqual({ status: 'saved', pending: 0 })
  })

  it('leaves no timer behind after a stalled attempt settles', async () => {
    const fn = vi
      .fn()
      .mockReturnValueOnce(new Promise((r) => setTimeout(() => r(OK), ATTEMPT_TIMEOUT_MS + 1)))
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS + 1)
    await result
    await vi.runAllTimersAsync()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns the sign-in failure unchanged when the browser session is still valid', async () => {
    mockClassify.mockResolvedValue('server')
    const failure = { success: false as const, error: SIGN_IN }
    await expect(withReconnect(async () => failure)).resolves.toBe(failure)
    expect(getConnectionStatus()).toBe('ok')
  })
})
