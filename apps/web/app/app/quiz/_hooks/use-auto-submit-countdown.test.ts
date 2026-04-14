import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoSubmitCountdown } from './use-auto-submit-countdown'

describe('useAutoSubmitCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it('returns the initial seconds value when first rendered', () => {
    const onSubmit = vi.fn()
    const { result } = renderHook(() =>
      useAutoSubmitCountdown({ active: true, seconds: 10, submitting: false, onSubmit }),
    )
    expect(result.current).toBe(10)
  })

  it('decrements the countdown by 1 each second while active', () => {
    const onSubmit = vi.fn()
    const { result } = renderHook(() =>
      useAutoSubmitCountdown({ active: true, seconds: 5, submitting: false, onSubmit }),
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe(4)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe(3)
  })

  it('fires onSubmit exactly once when the countdown reaches zero', () => {
    const onSubmit = vi.fn()
    renderHook(() =>
      useAutoSubmitCountdown({ active: true, seconds: 3, submitting: false, onSubmit }),
    )

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('sets countdown to 0 after the full duration elapses', () => {
    const onSubmit = vi.fn()
    const { result } = renderHook(() =>
      useAutoSubmitCountdown({ active: true, seconds: 3, submitting: false, onSubmit }),
    )

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current).toBe(0)
  })

  it('does not start counting down when active is false', () => {
    const onSubmit = vi.fn()
    const { result } = renderHook(() =>
      useAutoSubmitCountdown({ active: false, seconds: 5, submitting: false, onSubmit }),
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current).toBe(5)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not start counting down when submitting is true', () => {
    const onSubmit = vi.fn()
    const { result } = renderHook(() =>
      useAutoSubmitCountdown({ active: true, seconds: 5, submitting: true, onSubmit }),
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current).toBe(5)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('resets the countdown when deactivated', () => {
    const onSubmit = vi.fn()
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useAutoSubmitCountdown({ active, seconds: 10, submitting: false, onSubmit }),
      { initialProps: { active: true } },
    )

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(result.current).toBe(6)

    rerender({ active: false })

    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(result.current).toBe(10)
  })

  it('does not fire onSubmit twice if the effect re-runs after countdown reaches zero', () => {
    const onSubmit = vi.fn()
    const { rerender } = renderHook(
      ({ seconds }: { seconds: number }) =>
        useAutoSubmitCountdown({ active: true, seconds, submitting: false, onSubmit }),
      { initialProps: { seconds: 2 } },
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)

    // Re-render with an actual prop change that re-triggers the effect
    rerender({ seconds: 3 })

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    // firedRef guard should prevent a second call
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('uses the latest onSubmit callback, not the one captured at mount', () => {
    const firstSubmit = vi.fn()
    const secondSubmit = vi.fn()

    const { rerender } = renderHook(
      ({ onSubmit }: { onSubmit: () => void }) =>
        useAutoSubmitCountdown({ active: true, seconds: 3, submitting: false, onSubmit }),
      { initialProps: { onSubmit: firstSubmit } },
    )

    // Swap the callback before the countdown finishes
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    rerender({ onSubmit: secondSubmit })

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(firstSubmit).not.toHaveBeenCalled()
    expect(secondSubmit).toHaveBeenCalledTimes(1)
  })

  it('resumes countdown after being reactivated following a reset', () => {
    const onSubmit = vi.fn()
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useAutoSubmitCountdown({ active, seconds: 5, submitting: false, onSubmit }),
      { initialProps: { active: true } },
    )

    // Partially count down, then deactivate
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    rerender({ active: false })
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(result.current).toBe(5)
    expect(onSubmit).not.toHaveBeenCalled()

    // Reactivate — should start fresh from 5
    rerender({ active: true })
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current).toBe(0)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
