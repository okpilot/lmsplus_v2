import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionQuestion } from '@/app/app/_types/session'
import {
  _resetDiscoveryPrefetch,
  clearDiscoveryPrefetch,
  readDiscoveryPrefetch,
  setDiscoveryPrefetch,
} from './discovery-prefetch'

function makePrefetch(overrides: { userId?: string; sessionId?: string } = {}) {
  return {
    userId: 'user-1',
    sessionId: 'session-1',
    questions: [{ id: 'q-1' }] as SessionQuestion[],
    flaggedIds: ['q-1'],
    ...overrides,
  }
}

beforeEach(() => {
  _resetDiscoveryPrefetch()
})

describe('discovery prefetch', () => {
  it('returns the stored payload for the matching user and session', () => {
    const p = makePrefetch()
    setDiscoveryPrefetch(p)
    expect(readDiscoveryPrefetch('user-1', 'session-1')).toEqual(p)
  })

  it('returns null when nothing was stored', () => {
    expect(readDiscoveryPrefetch('user-1', 'session-1')).toBeNull()
  })

  it('returns null for a different session id', () => {
    setDiscoveryPrefetch(makePrefetch())
    expect(readDiscoveryPrefetch('user-1', 'session-2')).toBeNull()
  })

  it('returns null for a different user', () => {
    setDiscoveryPrefetch(makePrefetch())
    expect(readDiscoveryPrefetch('user-2', 'session-1')).toBeNull()
  })

  it('serves the same payload on repeated reads', () => {
    setDiscoveryPrefetch(makePrefetch())
    readDiscoveryPrefetch('user-1', 'session-1')
    expect(readDiscoveryPrefetch('user-1', 'session-1')).not.toBeNull()
  })

  it('replaces an earlier payload when a new one is stored', () => {
    setDiscoveryPrefetch(makePrefetch({ sessionId: 'old' }))
    setDiscoveryPrefetch(makePrefetch({ sessionId: 'new' }))
    expect(readDiscoveryPrefetch('user-1', 'old')).toBeNull()
    expect(readDiscoveryPrefetch('user-1', 'new')).not.toBeNull()
  })

  it('clears the payload for its own user', () => {
    setDiscoveryPrefetch(makePrefetch())
    clearDiscoveryPrefetch('user-1')
    expect(readDiscoveryPrefetch('user-1', 'session-1')).toBeNull()
  })

  it('keeps another user payload when clearing a different user', () => {
    setDiscoveryPrefetch(makePrefetch())
    clearDiscoveryPrefetch('user-2')
    expect(readDiscoveryPrefetch('user-1', 'session-1')).not.toBeNull()
  })
})
