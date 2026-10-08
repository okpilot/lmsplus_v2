import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { releaseBackGuard, useBackGuard } from './use-back-guard'

const popstate = () => window.dispatchEvent(new PopStateEvent('popstate'))

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState({ __NA: true }, '')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBackGuard', () => {
  it('pushes one sentinel history entry carrying the current state while active', () => {
    const push = vi.spyOn(window.history, 'pushState')
    renderHook(() => useBackGuard(true, vi.fn()))
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({ __NA: true }, '')
  })

  it('reports a back attempt and re-arms the sentinel', () => {
    const onAttempt = vi.fn()
    renderHook(() => useBackGuard(true, onAttempt))
    const push = vi.spyOn(window.history, 'pushState')
    act(() => popstate())
    expect(onAttempt).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('reports the latest handler without re-pushing the sentinel', () => {
    const first = vi.fn()
    const second = vi.fn()
    const push = vi.spyOn(window.history, 'pushState')
    const { rerender } = renderHook(({ cb }) => useBackGuard(true, cb), {
      initialProps: { cb: first },
    })
    rerender({ cb: second })
    expect(push).toHaveBeenCalledTimes(1)
    act(() => popstate())
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('does nothing while inactive', () => {
    const onAttempt = vi.fn()
    const push = vi.spyOn(window.history, 'pushState')
    renderHook(() => useBackGuard(false, onAttempt))
    act(() => popstate())
    expect(push).not.toHaveBeenCalled()
    expect(onAttempt).not.toHaveBeenCalled()
  })

  it('stops reporting once it becomes inactive', () => {
    const onAttempt = vi.fn()
    const { rerender } = renderHook(({ active }) => useBackGuard(active, onAttempt), {
      initialProps: { active: true },
    })
    rerender({ active: false })
    act(() => popstate())
    expect(onAttempt).not.toHaveBeenCalled()
  })

  it('stops reporting after unmount', () => {
    const onAttempt = vi.fn()
    const { unmount } = renderHook(() => useBackGuard(true, onAttempt))
    unmount()
    act(() => popstate())
    expect(onAttempt).not.toHaveBeenCalled()
  })
})

describe('releaseBackGuard', () => {
  it('pops the sentinel entry and resolves once the browser has gone back', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const onAttempt = vi.fn()
    const { result } = renderHook(() => useBackGuard(true, onAttempt))
    let settled = false
    const pending = result.current.release().then(() => {
      settled = true
    })
    expect(back).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(settled).toBe(false)
    act(() => popstate())
    await pending
    expect(settled).toBe(true)
    expect(onAttempt).not.toHaveBeenCalled()
  })

  it('resolves after the fallback timeout when the browser never reports the pop', async () => {
    vi.useFakeTimers()
    vi.spyOn(window.history, 'back').mockImplementation(() => {})
    renderHook(() => useBackGuard(true, vi.fn()))
    const pending = releaseBackGuard()
    await vi.advanceTimersByTimeAsync(500)
    await expect(pending).resolves.toBeUndefined()
  })

  it('resolves immediately without touching history when no guard is armed', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    await releaseBackGuard()
    expect(back).not.toHaveBeenCalled()
  })

  it('pops the sentinel only once when called twice', async () => {
    vi.useFakeTimers()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    renderHook(() => useBackGuard(true, vi.fn()))
    const first = releaseBackGuard()
    const second = releaseBackGuard()
    await vi.advanceTimersByTimeAsync(500)
    await Promise.all([first, second])
    expect(back).toHaveBeenCalledTimes(1)
  })
})
