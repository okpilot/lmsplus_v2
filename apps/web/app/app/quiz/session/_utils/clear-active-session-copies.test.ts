import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearActiveSessionById, clearActiveSessionsExcept } from './clear-active-session-copies'

const store = (userId: string, sessionId: string) =>
  localStorage.setItem(`quiz-active-session:${userId}`, JSON.stringify({ userId, sessionId }))

beforeEach(() => {
  localStorage.clear()
})

describe('clearActiveSessionById', () => {
  it('removes the local copy of the given session', () => {
    store('u1', 's1')
    clearActiveSessionById('s1')
    expect(localStorage.getItem('quiz-active-session:u1')).toBeNull()
  })

  it('keeps local copies of other sessions and unrelated keys', () => {
    store('u1', 's1')
    store('u2', 's2')
    localStorage.setItem('other-key', JSON.stringify({ sessionId: 's2' }))
    clearActiveSessionById('s2')
    expect(localStorage.getItem('quiz-active-session:u1')).not.toBeNull()
    expect(localStorage.getItem('quiz-active-session:u2')).toBeNull()
    expect(localStorage.getItem('other-key')).not.toBeNull()
  })

  it('skips a malformed entry and still removes the matching one', () => {
    localStorage.setItem('quiz-active-session:bad', '{not json')
    store('u1', 's1')
    clearActiveSessionById('s1')
    expect(localStorage.getItem('quiz-active-session:bad')).toBe('{not json')
    expect(localStorage.getItem('quiz-active-session:u1')).toBeNull()
  })

  it('does not throw when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    store('u1', 's1')
    expect(() => clearActiveSessionById('s1')).not.toThrow()
    spy.mockRestore()
  })
})

describe('clearActiveSessionsExcept', () => {
  it('removes copies of every other session and keeps the given one', () => {
    store('u1', 'old')
    store('u2', 'keep')
    localStorage.setItem('other-key', JSON.stringify({ sessionId: 'old' }))
    clearActiveSessionsExcept('keep')
    expect(localStorage.getItem('quiz-active-session:u1')).toBeNull()
    expect(localStorage.getItem('quiz-active-session:u2')).not.toBeNull()
    expect(localStorage.getItem('other-key')).not.toBeNull()
  })
})
