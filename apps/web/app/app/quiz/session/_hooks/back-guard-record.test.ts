import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSentinelRecord, onOwnSentinel, recordSentinel } from './back-guard-record'

beforeEach(() => {
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

describe('back-guard sentinel record', () => {
  it('is not on its own sentinel before anything was recorded', () => {
    expect(onOwnSentinel()).toBe(false)
  })

  it('recognises the entry it recorded', () => {
    recordSentinel()
    expect(onOwnSentinel()).toBe(true)
  })

  it('forgets the entry once the record is cleared', () => {
    recordSentinel()
    clearSentinelRecord()
    expect(onOwnSentinel()).toBe(false)
  })

  it('does not recognise a recorded entry after the history grew', () => {
    recordSentinel()
    window.history.pushState(null, '')
    expect(onOwnSentinel()).toBe(false)
  })

  it('ignores a malformed record', () => {
    window.sessionStorage.setItem('lms-back-guard', '{not json')
    expect(onOwnSentinel()).toBe(false)
    window.sessionStorage.setItem('lms-back-guard', 'null')
    expect(onOwnSentinel()).toBe(false)
  })

  it('treats unavailable storage as not on its own sentinel', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(onOwnSentinel()).toBe(false)
  })

  it('swallows storage write and clear failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => recordSentinel()).not.toThrow()
    expect(() => clearSentinelRecord()).not.toThrow()
  })
})
