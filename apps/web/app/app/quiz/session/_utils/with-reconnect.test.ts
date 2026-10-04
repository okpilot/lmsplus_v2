import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClassify, mockLinkIsDown } = vi.hoisted(() => ({
  mockClassify: vi.fn(),
  mockLinkIsDown: vi.fn(),
}))

vi.mock('./classify-failure', () => ({
  classifyFailure: (...a: unknown[]) => mockClassify(...a),
  linkIsDown: () => mockLinkIsDown(),
}))

import { SIGN_IN } from '../../actions/progress-error-messages'
import {
  _resetConnectionState,
  getConnectionSnapshot,
  getConnectionStatus,
  setConnectionStatus,
} from './connection-state'
import {
  _resetWithReconnect,
  ATTEMPT_TIMEOUT_MS,
  BACKOFF_MS,
  resumeQueue,
  whenQueueIdle,
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

  it('resends a TypeError on the first three attempts but rethrows it on the fourth when the link is up', async () => {
    mockClassify.mockImplementation(async (thrown?: unknown) =>
      thrown instanceof TypeError ? 'offline' : 'server',
    )
    const bug = new TypeError('client bug')
    const fn = vi.fn().mockRejectedValue(bug)
    const result = withReconnect(fn)
    const settled = expect(result).rejects.toBe(bug)
    for (const delay of [2000, 4000, 8000]) await vi.advanceTimersByTimeAsync(delay)
    await settled
    expect(fn).toHaveBeenCalledTimes(4)
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

  it('rethrows a server error on the first attempt without blocking', async () => {
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
    mockLinkIsDown.mockResolvedValue(true)
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
    mockLinkIsDown.mockResolvedValue(true)
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

  it('ends an offline block without Saved when a queued call returns a refused sign-in', async () => {
    mockClassify.mockImplementation(async (_thrown?: unknown, responded?: boolean) =>
      responded ? 'server' : 'offline',
    )
    const refused = { success: false as const, error: SIGN_IN }
    const fn = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValue(refused)
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('offline')
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await expect(result).resolves.toBe(refused)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(getConnectionSnapshot()).toEqual({ status: 'ok', pending: 0 })
  })

  it('tells the classifier the server responded only when the call returned a value', async () => {
    mockClassify.mockResolvedValue('server')
    await withReconnect(async () => ({}) as { success: boolean })
    expect(mockClassify).toHaveBeenLastCalledWith(undefined, true)
    await expect(withReconnect(() => Promise.reject(new Error('x')))).rejects.toThrow()
    expect(mockClassify).toHaveBeenLastCalledWith(expect.any(Error), true)
    await expect(withReconnect(() => Promise.reject(new TypeError('x')))).rejects.toThrow()
    expect(mockClassify).toHaveBeenLastCalledWith(expect.any(TypeError), false)
  })

  it('tells the classifier the server responded when a resend throws a plain error', async () => {
    mockClassify.mockResolvedValueOnce('offline').mockResolvedValue('server')
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('x'))
      .mockRejectedValueOnce(new Error('500'))
    const result = withReconnect(fn)
    const settled = result.catch(() => {})
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await settled
    expect(mockClassify).toHaveBeenLastCalledWith(expect.any(Error), true)
  })

  it('resends a call sleeping in backoff as soon as the queue is resumed', async () => {
    mockClassify.mockResolvedValue('offline')
    const fn = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValue(OK)
    const result = withReconnect(fn)
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(1)
    resumeQueue()
    await expect(result).resolves.toBe(OK)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('keeps the blocked status while a call is still pending after the queue is resumed', async () => {
    mockLinkIsDown.mockResolvedValue(true)
    mockClassify.mockResolvedValue('signed-out')
    const gate: { release: () => void } = { release: () => {} }
    const slow = new Promise<typeof OK>((resolve) => {
      gate.release = () => resolve(OK)
    })
    const held = withReconnect(vi.fn().mockReturnValue(slow))
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS)
    expect(getConnectionStatus()).toBe('offline')
    resumeQueue()
    expect(getConnectionStatus()).toBe('offline')
    gate.release()
    await held
  })

  it('clears a stale offline, slow or signed-out status when nothing is pending', () => {
    setConnectionStatus('offline')
    resumeQueue()
    expect(getConnectionStatus()).toBe('ok')
    setConnectionStatus('slow')
    resumeQueue()
    expect(getConnectionStatus()).toBe('ok')
    setConnectionStatus('signed-out')
    resumeQueue()
    expect(getConnectionStatus()).toBe('ok')
  })
})

describe('whenQueueIdle', () => {
  it('resolves at once when nothing is queued', async () => {
    const idle = whenQueueIdle()
    await vi.advanceTimersByTimeAsync(0)
    await expect(idle).resolves.toBeUndefined()
  })

  it('resolves only after a queued save has settled', async () => {
    mockClassify.mockResolvedValue('offline')
    const gate: { release: () => void } = { release: () => {} }
    const save = withReconnect(
      () =>
        new Promise<typeof OK>((resolve) => {
          gate.release = () => resolve(OK)
        }),
    )
    let idle = false
    const waiting = whenQueueIdle().then(() => {
      idle = true
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(idle).toBe(false)
    gate.release()
    await save
    expect(idle).toBe(false)
    await vi.advanceTimersByTimeAsync(0)
    await waiting
    expect(idle).toBe(true)
  })

  it('resolves only after the saving caller has finished its own follow-up work', async () => {
    const order: string[] = []
    const save = withReconnect(() => Promise.resolve(OK))
    void save.then(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve()
      order.push('follow-up')
    })
    void whenQueueIdle().then(() => order.push('idle'))
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['follow-up', 'idle'])
  })
})
