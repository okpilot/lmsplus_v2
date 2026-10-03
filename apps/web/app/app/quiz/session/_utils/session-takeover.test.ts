import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetQuizDeviceId, getQuizDeviceId } from './quiz-device-id'
import {
  _resetSessionTakeover,
  announceClaim,
  clearTakenOver,
  isTakenOver,
  markTakenOver,
  onPeerClaim,
  onTakenOver,
} from './session-takeover'

class FakeChannel {
  static instances = new Set<FakeChannel>()
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor(public name: string) {
    FakeChannel.instances.add(this)
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.instances) {
      if (c !== this && c.name === this.name) c.onmessage?.({ data })
    }
  }
  close() {
    FakeChannel.instances.delete(this)
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  _resetQuizDeviceId()
  _resetSessionTakeover()
  FakeChannel.instances.clear()
  vi.stubGlobal('BroadcastChannel', FakeChannel)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('takeover state', () => {
  it('calls the listener once and flags only the taken-over session', () => {
    const listener = vi.fn()
    onTakenOver('s1', listener)
    markTakenOver('s1')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(isTakenOver('s1')).toBe(true)
    expect(isTakenOver('s2')).toBe(false)
  })

  it('notifies listeners only for the first takeover of a session', () => {
    const listener = vi.fn()
    onTakenOver('s1', listener)
    markTakenOver('s1')
    markTakenOver('s1')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not call listeners of another session', () => {
    const listener = vi.fn()
    onTakenOver('s2', listener)
    markTakenOver('s1')
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops calling a listener after it unsubscribes', () => {
    const listener = vi.fn()
    onTakenOver('s1', listener)()
    markTakenOver('s1')
    expect(listener).not.toHaveBeenCalled()
  })

  it('forgets the takeover once cleared', () => {
    markTakenOver('s1')
    clearTakenOver('s1')
    expect(isTakenOver('s1')).toBe(false)
  })
})

describe('peer claims', () => {
  function peerClaim(data: unknown) {
    new FakeChannel('lmsplus-quiz-claim').postMessage(data)
  }

  it('calls back when another device claims the same session', () => {
    const cb = vi.fn()
    onPeerClaim('s1', cb)
    peerClaim({ sessionId: 's1', deviceId: 'other-device' })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('ignores a claim announced by this device', () => {
    const cb = vi.fn()
    onPeerClaim('s1', cb)
    peerClaim({ sessionId: 's1', deviceId: getQuizDeviceId() })
    expect(cb).not.toHaveBeenCalled()
  })

  it('ignores a claim of another session', () => {
    const cb = vi.fn()
    onPeerClaim('s1', cb)
    peerClaim({ sessionId: 's2', deviceId: 'other-device' })
    expect(cb).not.toHaveBeenCalled()
  })

  it.each([null, 'text', 42, {}, { sessionId: 's1' }, { sessionId: 1, deviceId: 'd' }])(
    'ignores the malformed message %j',
    (data) => {
      const cb = vi.fn()
      onPeerClaim('s1', cb)
      peerClaim(data)
      expect(cb).not.toHaveBeenCalled()
    },
  )

  it('stops listening after it unsubscribes', () => {
    const cb = vi.fn()
    onPeerClaim('s1', cb)()
    peerClaim({ sessionId: 's1', deviceId: 'other-device' })
    expect(cb).not.toHaveBeenCalled()
  })

  it('announces this device id and session on the claim channel', () => {
    const received: unknown[] = []
    const listener = new FakeChannel('lmsplus-quiz-claim')
    listener.onmessage = (e) => received.push(e.data)
    announceClaim('s1')
    expect(received).toEqual([{ sessionId: 's1', deviceId: getQuizDeviceId() }])
  })

  it('does nothing and does not throw without BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(() => announceClaim('s1')).not.toThrow()
    expect(() => onPeerClaim('s1', vi.fn())()).not.toThrow()
  })

  it('warns instead of throwing when the channel cannot be created', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('blocked')
        }
      },
    )
    expect(() => announceClaim('s1')).not.toThrow()
    expect(() => onPeerClaim('s1', vi.fn())()).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })
})
