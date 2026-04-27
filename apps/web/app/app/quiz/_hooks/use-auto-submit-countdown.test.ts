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

  it('fires onSubmit exactly once even when the submit effect re-runs after zero', () => {
    // Regression: verify that moving the submit call out of the setCountdown
    // updater (to fix the setState-in-render warning) does not cause double fire.
    const onSubmit = vi.fn()
    const { rerender } = renderHook(
      ({ submitting }: { submitting: boolean }) =>
        useAutoSubmitCountdown({ active: true, seconds: 2, submitting, onSubmit }),
      { initialProps: { submitting: false } },
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)

    // Simulate a re-render (e.g. parent state update) after countdown reaches 0
    rerender({ submitting: false })
    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not fire onSubmit when submitting becomes true before countdown reaches zero', () => {
    const onSubmit = vi.fn()
    const { rerender } = renderHook(
      ({ submitting }: { submitting: boolean }) =>
        useAutoSubmitCountdown({ active: true, seconds: 3, submitting, onSubmit }),
      { initialProps: { submitting: false } },
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Mark as submitting before countdown reaches zero
    rerender({ submitting: true })

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('fires onSubmit again on second activation after countdown completed and dialog was closed', () => {
    // Tests the full open→fire→close→reopen→fire cycle.
    // firedRef is reset to false by Effect 3 when active goes false,
    // so the second activation must produce a fresh countdown and fire once more.
    const onSubmit = vi.fn()
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useAutoSubmitCountdown({ active, seconds: 3, submitting: false, onSubmit }),
      { initialProps: { active: true } },
    )

    // First cycle: countdown fires at zero
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBe(0)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    // Dialog closes — deactivate resets firedRef and restores display value
    rerender({ active: false })
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(result.current).toBe(3)

    // Dialog reopens — second activation should countdown fresh and fire again
    rerender({ active: true })
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBe(0)
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })
})
