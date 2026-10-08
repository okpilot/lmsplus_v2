import { renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockArm, mockDisarm } = vi.hoisted(() => ({ mockArm: vi.fn(), mockDisarm: vi.fn() }))
vi.mock('@/lib/history-guard', () => ({ armHistoryGuard: mockArm }))

import { useBackGuard } from './use-back-guard'

beforeEach(() => {
  vi.resetAllMocks()
  mockArm.mockReturnValue(mockDisarm)
})

describe('useBackGuard', () => {
  it('arms the history guard while active', () => {
    renderHook(() => useBackGuard(true, vi.fn()))
    expect(mockArm).toHaveBeenCalledTimes(1)
    expect(mockDisarm).not.toHaveBeenCalled()
  })

  it('does not arm while inactive', () => {
    renderHook(() => useBackGuard(false, vi.fn()))
    expect(mockArm).not.toHaveBeenCalled()
  })

  it('disarms when it turns inactive and re-arms when it turns active again', () => {
    const { rerender } = renderHook(({ active }) => useBackGuard(active, vi.fn()), {
      initialProps: { active: true },
    })
    rerender({ active: false })
    expect(mockDisarm).toHaveBeenCalledTimes(1)
    rerender({ active: true })
    expect(mockArm).toHaveBeenCalledTimes(2)
  })

  it('disarms on unmount', () => {
    renderHook(() => useBackGuard(true, vi.fn())).unmount()
    expect(mockDisarm).toHaveBeenCalledTimes(1)
  })

  it('reports an attempt to the latest callback without re-arming', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useBackGuard(true, cb), {
      initialProps: { cb: first },
    })
    rerender({ cb: second })
    expect(mockArm).toHaveBeenCalledTimes(1)
    mockArm.mock.lastCall?.[0]()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('ends up armed once after StrictMode re-runs the effect', () => {
    renderHook(() => useBackGuard(true, vi.fn()), { wrapper: StrictMode })
    expect(mockArm.mock.calls.length - mockDisarm.mock.calls.length).toBe(1)
  })
})
