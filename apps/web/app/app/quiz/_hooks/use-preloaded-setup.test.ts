import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PreloadPromise, QuizSetupPreload } from '../types'
import { usePreloadedSetup } from './use-preloaded-setup'

function deferred() {
  let resolve: (v: QuizSetupPreload) => void = () => undefined
  const promise: PreloadPromise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const SETUP: QuizSetupPreload = { topicsBySubject: { s1: [] }, discoveryCounts: {} }
const OTHER: QuizSetupPreload = { topicsBySubject: { s2: [] }, discoveryCounts: {} }

describe('usePreloadedSetup', () => {
  it('holds nothing until the preload resolves, then exposes it', async () => {
    const { promise, resolve } = deferred()
    const { result } = renderHook(() => usePreloadedSetup(promise))
    expect(result.current.current).toBeNull()

    await act(async () => resolve(SETUP))

    expect(result.current.current).toMatchObject(SETUP)
  })

  it('holds nothing when there is no preload', () => {
    const { result } = renderHook(() => usePreloadedSetup(undefined))
    expect(result.current.current).toBeNull()
  })

  it('ignores a preload that resolves after the component unmounted', async () => {
    const { promise, resolve } = deferred()
    const { result, unmount } = renderHook(() => usePreloadedSetup(promise))
    unmount()

    await act(async () => resolve(SETUP))

    expect(result.current.current).toBeNull()
  })

  it('switches to a new preload once it resolves', async () => {
    const first = deferred()
    const second = deferred()
    const { result, rerender } = renderHook(({ p }) => usePreloadedSetup(p), {
      initialProps: { p: first.promise },
    })
    await act(async () => first.resolve(SETUP))

    rerender({ p: second.promise })
    expect(result.current.current).toMatchObject(SETUP)
    await act(async () => second.resolve(OTHER))

    expect(result.current.current).toMatchObject(OTHER)
  })

  it('reads an already-resolved preload synchronously after a remount', async () => {
    const { promise, resolve } = deferred()
    const first = renderHook(() => usePreloadedSetup(promise))
    await act(async () => resolve(SETUP))
    first.unmount()

    const remounted = renderHook(() => usePreloadedSetup(promise))

    expect(remounted.result.current.current).toMatchObject(SETUP)
  })

  it('falls back to nothing when the preload promise rejects', async () => {
    const promise: PreloadPromise = Promise.reject(new Error('stream failed'))
    const { result } = renderHook(() => usePreloadedSetup(promise))

    await act(async () => {
      await promise.catch(() => undefined)
    })

    expect(result.current.current).toBeNull()
  })

  describe('load time', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('stamps the value once so a remount keeps the original load time', async () => {
      vi.useFakeTimers({ now: 10_000 })
      const { promise, resolve } = deferred()
      const first = renderHook(() => usePreloadedSetup(promise))
      await act(async () => resolve(SETUP))
      expect(first.result.current.current?.loadedAt).toBe(10_000)
      first.unmount()

      vi.setSystemTime(10_000 + 61_000)
      const remounted = renderHook(() => usePreloadedSetup(promise))
      await act(async () => undefined)

      expect(remounted.result.current.current?.loadedAt).toBe(10_000)
    })
  })
})
