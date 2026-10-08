import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSentinelRecord, onOwnSentinel, recordSentinel } from './back-guard-record'

beforeEach(() => {
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

describe('back-guard sentinel record', () => {
  it('is not on its own sentinel before anything was recorded', () => {
    expect(onOwnSentinel('k1')).toBe(false)
  })

  it('recognises the entry it recorded', () => {
    recordSentinel('k1')
    expect(onOwnSentinel('k1')).toBe(true)
  })

  it('stores the session key in the record', () => {
    recordSentinel('session-a')
    const rec = JSON.parse(window.sessionStorage.getItem('lms-back-guard') ?? 'null')
    expect(rec).toMatchObject({ key: 'session-a', path: window.location.pathname })
  })

  it('does not recognise an entry recorded for another session at the same path and length', () => {
    recordSentinel('session-a')
    expect(onOwnSentinel('session-b')).toBe(false)
  })

  it('forgets the entry once the record is cleared', () => {
    recordSentinel('k1')
    clearSentinelRecord()
    expect(onOwnSentinel('k1')).toBe(false)
  })

  it('does not recognise a recorded entry after the history grew', () => {
    recordSentinel('k1')
    window.history.pushState(null, '')
    expect(onOwnSentinel('k1')).toBe(false)
  })

  it('ignores a malformed record', () => {
    window.sessionStorage.setItem('lms-back-guard', '{not json')
    expect(onOwnSentinel('k1')).toBe(false)
    window.sessionStorage.setItem('lms-back-guard', 'null')
    expect(onOwnSentinel('k1')).toBe(false)
  })

  it('treats unavailable storage as not on its own sentinel', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(onOwnSentinel('k1')).toBe(false)
  })

  it('swallows storage write and clear failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => recordSentinel('k1')).not.toThrow()
    expect(() => clearSentinelRecord()).not.toThrow()
  })
})
