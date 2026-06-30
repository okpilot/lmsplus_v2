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
    expect(clearSpy).toHaveBeenCalledTimes(1)
  })

  it('propagates a rejection that occurs before the timeout, not the fallback', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('network error')), 1000, 'FALLBACK'),
    ).rejects.toThrow('network error')
  })

  it('keeps the fallback and stays quiet when the promise rejects after the timeout', async () => {
    vi.useFakeTimers()
    let rejectHung!: (reason: unknown) => void
    const hung = new Promise<string>((_resolve, reject) => {
      rejectHung = reject
    })
    const result = withTimeout(hung, 1000, 'FALLBACK')
    await vi.advanceTimersByTimeAsync(1001)
    expect(await result).toBe('FALLBACK')
    // The hung connection finally errors after the timeout already won — this
    // must not surface as an unhandled rejection (the no-op catch handles it).
    rejectHung(new Error('late connection error'))
    await Promise.resolve()
  })

  it('keeps the fallback when the promise resolves after the timeout', async () => {
    vi.useFakeTimers()
    let resolveHung!: (value: string) => void
    const hung = new Promise<string>((resolve) => {
      resolveHung = resolve
    })
    const result = withTimeout(hung, 1000, 'FALLBACK')
    await vi.advanceTimersByTimeAsync(1001)
    expect(await result).toBe('FALLBACK')
    // The late value arrives after the timeout already won — it is discarded.
    resolveHung('LATE')
    await Promise.resolve()
  })
})
