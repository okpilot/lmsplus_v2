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
  subscribeConnection,
} from './connection-state'
import { _resetRefusedSave, refusedAnswerHold } from './refused-save'
import { BACKOFF_MS } from './retry-wait'
import {
  _resetWithReconnect,
  ATTEMPT_TIMEOUT_MS,
  whenQueueIdle,
  withReconnect,
} from './with-reconnect'

const OK = { success: true as const }
const REFUSED = {
  success: false as const,
  error: 'This answer could not be saved. Please review it and try again.',
}
const UNMAPPED = { success: false as const, error: 'Could not save progress' }

function statusHistory() {
  const seen: string[] = []
  subscribeConnection(() => seen.push(getConnectionStatus()))
  return seen
}

function holdControl() {
  const resolvers: Array<(v: 'retry' | 'done') => void> = []
  const hold = vi.fn(
    () =>
      new Promise<'retry' | 'done'>((resolve) => {
        resolvers.push(resolve)
      }),
  )
  return { hold, resolvers }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  mockClassify.mockResolvedValue('server')
  _resetConnectionState()
  _resetWithReconnect()
  _resetRefusedSave()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('withReconnect hold', () => {
  it('runs the call once and settles when no hold is given', async () => {
    const fn = vi.fn().mockResolvedValue(REFUSED)
    await expect(withReconnect(fn)).resolves.toBe(REFUSED)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('resends the same call when the hold answers retry and settles on done', async () => {
    const fn = vi.fn().mockResolvedValueOnce(REFUSED).mockResolvedValue(OK)
    const { hold, resolvers } = holdControl()
    const result = withReconnect(fn, hold)
    await vi.advanceTimersByTimeAsync(0)
    expect(hold).toHaveBeenCalledWith({ kind: 'value', value: REFUSED })
    resolvers[0]?.('retry')
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2)
    resolvers[1]?.('done')
    await expect(result).resolves.toBe(OK)
  })

  it('keeps Finish waiting while a refused save is held', async () => {
    const { hold, resolvers } = holdControl()
    void withReconnect(async () => REFUSED, hold)
    let idle = false
    void whenQueueIdle().then(() => {
      idle = true
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(idle).toBe(false)
    expect(getConnectionSnapshot().pending).toBe(1)
    resolvers[0]?.('done')
    await vi.advanceTimersByTimeAsync(10)
    expect(idle).toBe(true)
    expect(getConnectionSnapshot().pending).toBe(0)
  })

  it('runs a later save only after the held save is resolved', async () => {
    const { hold, resolvers } = holdControl()
    void withReconnect(async () => REFUSED, hold)
    const later = vi.fn().mockResolvedValue(OK)
    const laterResult = withReconnect(later)
    await vi.advanceTimersByTimeAsync(1000)
    expect(later).not.toHaveBeenCalled()
    resolvers[0]?.('done')
    await expect(laterResult).resolves.toBe(OK)
    expect(later).toHaveBeenCalledTimes(1)
  })

  it('passes a successful result to the hold too', async () => {
    const hold = vi.fn().mockResolvedValue('done')
    await withReconnect(async () => OK, hold)
    expect(hold).toHaveBeenCalledWith({ kind: 'value', value: OK })
  })

  it('offers a thrown server response to the hold and resends it on retry', async () => {
    const boom = new Error('server blew up')
    const fn = vi.fn().mockRejectedValueOnce(boom).mockResolvedValue(OK)
    const { hold, resolvers } = holdControl()
    const result = withReconnect(fn, hold)
    await vi.advanceTimersByTimeAsync(0)
    expect(hold).toHaveBeenCalledWith({ kind: 'thrown' })
    resolvers[0]?.('retry')
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2)
    resolvers[1]?.('done')
    await expect(result).resolves.toBe(OK)
  })

  it('rethrows the server error to the caller when the hold answers done on a thrown save', async () => {
    const boom = new Error('server blew up')
    const hold = vi.fn().mockResolvedValue('done')
    await expect(withReconnect(() => Promise.reject(boom), hold)).rejects.toBe(boom)
  })

  it('ends signed out when the sign-in expires after Try again', async () => {
    mockClassify.mockResolvedValue('signed-out')
    const fn = vi
      .fn()
      .mockResolvedValueOnce(REFUSED)
      .mockResolvedValue({ success: false as const, error: SIGN_IN })
    const { hold, resolvers } = holdControl()
    const result = withReconnect(fn, hold)
    await vi.advanceTimersByTimeAsync(0)
    resolvers[0]?.('retry')
    await expect(result).resolves.toEqual({ success: false, error: SIGN_IN })
    expect(getConnectionStatus()).toBe('signed-out')
    expect(hold).toHaveBeenCalledTimes(1)
  })

  it('holds again when a resend after reconnect is refused again', async () => {
    mockClassify.mockResolvedValue('offline')
    const fn = vi
      .fn()
      .mockResolvedValueOnce(REFUSED)
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(REFUSED)
    const { hold, resolvers } = holdControl()
    void withReconnect(fn, hold)
    await vi.advanceTimersByTimeAsync(0)
    resolvers[0]?.('retry')
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('offline')
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(hold).toHaveBeenCalledTimes(2)
  })

  it('keeps the held status when a slow-request probe finishes after the hold began', async () => {
    let releaseProbe: (down: boolean) => void = () => {}
    mockLinkIsDown.mockReturnValue(new Promise<boolean>((r) => (releaseProbe = r)))
    let settleRequest: (v: typeof REFUSED) => void = () => {}
    void withReconnect(() => new Promise<typeof REFUSED>((r) => (settleRequest = r)))
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS)
    setConnectionStatus('save-failed')
    releaseProbe(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('save-failed')
    settleRequest(REFUSED)
  })

  it('shows Still saving while a held save resends after an offline spell, then confirms the save', async () => {
    mockClassify.mockResolvedValue('offline')
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValue(OK)
    const result = withReconnect(fn, refusedAnswerHold())
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('offline')
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    expect(getConnectionStatus()).toBe('slow')
    await vi.advanceTimersByTimeAsync(2000)
    await expect(result).resolves.toBe(OK)
    expect(getConnectionStatus()).toBe('saved')
  })

  it('does not confirm a batch whose earlier save failed when a held resend drops offline again', async () => {
    mockClassify.mockResolvedValue('offline')
    const seen = statusHistory()
    const first = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(REFUSED)
    const second = vi
      .fn()
      .mockResolvedValueOnce(UNMAPPED)
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(OK)
    const firstResult = withReconnect(first)
    const secondResult = withReconnect(second, refusedAnswerHold())
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await expect(firstResult).resolves.toBe(REFUSED)
    await vi.advanceTimersByTimeAsync(2000)
    expect(getConnectionStatus()).toBe('offline')
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    await expect(secondResult).resolves.toBe(OK)
    expect(second).toHaveBeenCalledTimes(3)
    expect(seen).toContain('slow')
    expect(seen).not.toContain('saved')
    expect(getConnectionStatus()).toBe('ok')
  })
})
