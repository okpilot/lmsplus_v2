import { afterEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from './with-timeout'

afterEach(() => {
  vi.useRealTimers()
})

describe('withTimeout', () => {
  it('resolves with the value when the promise settles before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('VALUE'), 1000, 'FALLBACK')
    expect(result).toBe('VALUE')
  })

  it('resolves with the fallback when the promise hangs past the timeout', async () => {
    vi.useFakeTimers()
    const p = withTimeout(new Promise<string>(() => {}), 1000, 'FALLBACK')
    await vi.advanceTimersByTimeAsync(1001)
    expect(await p).toBe('FALLBACK')
  })

  it('does not leave a dangling timer when the promise resolves first', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    await withTimeout(Promise.resolve('VALUE'), 1000, 'FALLBACK')
    expect(clearSpy).toHaveBeenCalled()
  })
})
