import { afterEach, describe, expect, it, vi } from 'vitest'
import { withMinimumDuration } from './with-minimum-duration'

afterEach(() => {
  vi.useRealTimers()
})

describe('withMinimumDuration', () => {
  it('does not resolve before the floor even when the work finishes immediately', async () => {
    vi.useFakeTimers()
    let settled = false
    const result = withMinimumDuration(Promise.resolve('VALUE'), 1000).then((v) => {
      settled = true
      return v
    })
    await vi.advanceTimersByTimeAsync(999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toBe('VALUE')
    expect(settled).toBe(true)
  })

  it('resolves with the value once the floor has passed', async () => {
    vi.useFakeTimers()
    const result = withMinimumDuration(Promise.resolve('VALUE'), 1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await result).toBe('VALUE')
  })

  it('does not delay work that already takes longer than the floor', async () => {
    vi.useFakeTimers()
    let resolveWork!: (value: string) => void
    const work = new Promise<string>((resolve) => {
      resolveWork = resolve
    })
    const result = withMinimumDuration(work, 1000)
    await vi.advanceTimersByTimeAsync(2000)
    resolveWork('SLOW')
    expect(await result).toBe('SLOW')
  })

  it('propagates a rejection only after the floor has passed', async () => {
    const start = Date.now()
    await expect(withMinimumDuration(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom')
    expect(Date.now() - start).toBeGreaterThanOrEqual(50)
  })
})
