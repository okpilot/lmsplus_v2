import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKOFF_MS, clearRetryWaiters, waitForRetry, wakeRetryWaiters } from './retry-wait'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  clearRetryWaiters()
  vi.useRealTimers()
})

const STEP_1 = 4000
const LAST_STEP = 10000

function track(p: Promise<void>) {
  const state = { done: false }
  void p.then(() => {
    state.done = true
  })
  return state
}

describe('waitForRetry', () => {
  it('uses the documented backoff steps', () => {
    expect(BACKOFF_MS).toEqual([2000, STEP_1, 8000, LAST_STEP])
  })

  it('sleeps for the backoff step of its index', async () => {
    const wait = track(waitForRetry(1))
    await vi.advanceTimersByTimeAsync(STEP_1 - 1)
    expect(wait.done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(wait.done).toBe(true)
  })

  it('caps the delay at the last backoff step', async () => {
    const wait = track(waitForRetry(99))
    await vi.advanceTimersByTimeAsync(LAST_STEP)
    expect(wait.done).toBe(true)
  })

  it('wakes early when the browser reports it is online', async () => {
    const wait = track(waitForRetry(3))
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(wait.done).toBe(true)
  })

  it('wakes every sleeping job when the queue is resumed', async () => {
    const first = track(waitForRetry(3))
    const second = track(waitForRetry(3))
    wakeRetryWaiters()
    await vi.advanceTimersByTimeAsync(0)
    expect(first.done).toBe(true)
    expect(second.done).toBe(true)
  })
})
