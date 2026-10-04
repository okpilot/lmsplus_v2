import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetConnectionState,
  adjustPending,
  getConnectionSnapshot,
  getConnectionStatus,
  markSaved,
  setConnectionStatus,
  subscribeConnection,
} from './connection-state'

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  _resetConnectionState()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('connection state', () => {
  it('starts ok with nothing pending', () => {
    expect(getConnectionSnapshot()).toEqual({ status: 'ok', pending: 0 })
  })

  it('notifies subscribers when the status changes and not when it stays the same', () => {
    const listener = vi.fn()
    subscribeConnection(listener)
    setConnectionStatus('offline')
    setConnectionStatus('offline')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying a subscriber after it unsubscribes', () => {
    const listener = vi.fn()
    subscribeConnection(listener)()
    setConnectionStatus('offline')
    expect(listener).not.toHaveBeenCalled()
  })

  it('never lets the pending count go below zero', () => {
    adjustPending(1)
    adjustPending(-5)
    expect(getConnectionSnapshot().pending).toBe(0)
  })

  it('returns a new snapshot object only when something changed', () => {
    const before = getConnectionSnapshot()
    setConnectionStatus('ok')
    expect(getConnectionSnapshot()).toBe(before)
    adjustPending(1)
    expect(getConnectionSnapshot()).not.toBe(before)
  })

  it('shows saved briefly and then returns to ok', () => {
    markSaved()
    expect(getConnectionStatus()).toBe('saved')
    vi.advanceTimersByTime(1500)
    expect(getConnectionStatus()).toBe('ok')
  })

  it('keeps a newer status when the saved timer fires after a new outage', () => {
    markSaved()
    setConnectionStatus('offline')
    vi.advanceTimersByTime(5000)
    expect(getConnectionStatus()).toBe('offline')
  })
})
