import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClassify, mockLinkIsDown } = vi.hoisted(() => ({
  mockClassify: vi.fn(),
  mockLinkIsDown: vi.fn(),
}))

vi.mock('./classify-failure', () => ({
  classifyFailure: (...a: unknown[]) => mockClassify(...a),
  linkIsDown: () => mockLinkIsDown(),
}))

import { _resetConnectionState, getConnectionStatus, setConnectionStatus } from './connection-state'
import { _resetWithReconnect, withReconnect } from './with-reconnect'

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  _resetConnectionState()
  _resetWithReconnect()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('withReconnect markOffline', () => {
  it('keeps a signed-out block when a concurrent job fails on the network', async () => {
    mockClassify.mockResolvedValue('offline')
    let reject: (e: unknown) => void = () => {}
    const fn = vi.fn().mockReturnValue(
      new Promise((_, r) => {
        reject = r
      }),
    )
    void withReconnect(fn).catch(() => {})
    await vi.advanceTimersByTimeAsync(0)
    setConnectionStatus('signed-out')
    reject(new TypeError('fetch failed'))
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('signed-out')
  })
})
