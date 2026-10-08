import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReplace, mockToastInfo, mockRelease } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockToastInfo: vi.fn(),
  mockRelease: vi.fn(),
}))

vi.mock('./use-back-guard', () => ({ releaseBackGuard: () => mockRelease() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }))
vi.mock('sonner', () => ({ toast: { info: (...a: unknown[]) => mockToastInfo(...a) } }))

import { _resetQuizDeviceId } from '../_utils/quiz-device-id'
import { _resetSessionTakeover, isTakenOver, markTakenOver } from '../_utils/session-takeover'
import { useTakeoverExit } from './use-takeover-exit'

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
  mockRelease.mockResolvedValue(undefined)
  sessionStorage.clear()
  _resetQuizDeviceId()
  _resetSessionTakeover()
  FakeChannel.instances.clear()
  vi.stubGlobal('BroadcastChannel', FakeChannel)
})

describe('useTakeoverExit', () => {
  it('toasts and returns to the quiz picker when the session is taken over', async () => {
    renderHook(() => useTakeoverExit({ enabled: true, sessionId: 's1', probe: vi.fn() }))
    markTakenOver('s1')
    await vi.waitFor(() => expect(mockReplace).toHaveBeenCalled())
    expect(mockToastInfo).toHaveBeenCalledWith('This quiz continued in another tab or device.')
    expect(mockReplace).toHaveBeenCalledWith('/app/quiz')
  })

  it('pops the back-guard sentinel before leaving the runner', async () => {
    const order: string[] = []
    mockRelease.mockImplementation(async () => {
      order.push('release')
    })
    mockReplace.mockImplementation(() => order.push('replace'))
    renderHook(() => useTakeoverExit({ enabled: true, sessionId: 's1', probe: vi.fn() }))
    markTakenOver('s1')
    await vi.waitFor(() => expect(order).toEqual(['release', 'replace']))
  })

  it('probes the server when another tab of this browser claims the session', () => {
    const probe = vi.fn()
    renderHook(() => useTakeoverExit({ enabled: true, sessionId: 's1', probe }))
    peerClaim()
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('calls the latest probe without resubscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ probe }) => useTakeoverExit({ enabled: true, sessionId: 's1', probe }),
      { initialProps: { probe: first } },
    )
    rerender({ probe: second })
    peerClaim()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('forgets a stale takeover flag when the runner mounts', () => {
    markTakenOver('s1')
    renderHook(() => useTakeoverExit({ enabled: true, sessionId: 's1', probe: vi.fn() }))
    expect(isTakenOver('s1')).toBe(false)
  })

  it('does nothing after unmount', () => {
    const probe = vi.fn()
    const { unmount } = renderHook(() => useTakeoverExit({ enabled: true, sessionId: 's1', probe }))
    unmount()
    markTakenOver('s1')
    peerClaim()
    expect(mockRelease).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(probe).not.toHaveBeenCalled()
  })

  it('subscribes to nothing when disabled', () => {
    const probe = vi.fn()
    renderHook(() => useTakeoverExit({ enabled: false, sessionId: 's1', probe }))
    markTakenOver('s1')
    peerClaim()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(probe).not.toHaveBeenCalled()
  })
})
