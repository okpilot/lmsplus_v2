import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReplace, mockToastInfo } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockToastInfo: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }))
vi.mock('sonner', () => ({ toast: { info: (...a: unknown[]) => mockToastInfo(...a) } }))

import { _resetQuizDeviceId } from '../_utils/quiz-device-id'
import { _resetRunnerExit, isRunnerExiting } from '../_utils/runner-exit'
import { _resetSessionTakeover, isTakenOver, markTakenOver } from '../_utils/session-takeover'
import { useTakeoverWatch } from './use-takeover-watch'

class FakeChannel {
  static instances = new Set<FakeChannel>()
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor() {
    FakeChannel.instances.add(this)
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.instances) if (c !== this) c.onmessage?.({ data })
  }
  close() {
    FakeChannel.instances.delete(this)
  }
}

const peerClaim = () => new FakeChannel().postMessage({ sessionId: 's1', deviceId: 'other-device' })

beforeEach(() => {
  vi.resetAllMocks()
  _resetRunnerExit()
  sessionStorage.clear()
  _resetQuizDeviceId()
  _resetSessionTakeover()
  FakeChannel.instances.clear()
  vi.stubGlobal('BroadcastChannel', FakeChannel)
})

describe('useTakeoverWatch', () => {
  it('neither navigates nor toasts when the session is taken over, only releasing the guards', () => {
    renderHook(() => useTakeoverWatch({ enabled: true, sessionId: 's1', probe: vi.fn() }))
    markTakenOver('s1')
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockToastInfo).not.toHaveBeenCalled()
    expect(isRunnerExiting()).toBe(true)
  })

  it('probes the server when another tab of this browser claims the session', () => {
    const probe = vi.fn()
    renderHook(() => useTakeoverWatch({ enabled: true, sessionId: 's1', probe }))
    peerClaim()
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('calls the latest probe without resubscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ probe }) => useTakeoverWatch({ enabled: true, sessionId: 's1', probe }),
      { initialProps: { probe: first } },
    )
    rerender({ probe: second })
    peerClaim()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('forgets a stale takeover flag when the runner mounts', () => {
    markTakenOver('s1')
    renderHook(() => useTakeoverWatch({ enabled: true, sessionId: 's1', probe: vi.fn() }))
    expect(isTakenOver('s1')).toBe(false)
  })

  it('does nothing after unmount', () => {
    const probe = vi.fn()
    const { unmount } = renderHook(() =>
      useTakeoverWatch({ enabled: true, sessionId: 's1', probe }),
    )
    unmount()
    markTakenOver('s1')
    peerClaim()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(probe).not.toHaveBeenCalled()
  })

  it('subscribes to nothing when disabled', () => {
    const probe = vi.fn()
    renderHook(() => useTakeoverWatch({ enabled: false, sessionId: 's1', probe }))
    markTakenOver('s1')
    peerClaim()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(probe).not.toHaveBeenCalled()
  })
})
