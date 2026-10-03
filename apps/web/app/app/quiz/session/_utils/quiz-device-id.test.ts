import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetQuizDeviceId, getQuizDeviceId } from './quiz-device-id'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => {
  sessionStorage.clear()
  _resetQuizDeviceId()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('getQuizDeviceId', () => {
  it('creates a uuid and returns the same one for the rest of the page load', () => {
    const id = getQuizDeviceId()
    expect(id).toMatch(V4)
    expect(getQuizDeviceId()).toBe(id)
  })

  it('does not persist the id, so a duplicated tab cannot share it', () => {
    getQuizDeviceId()
    expect(sessionStorage.length).toBe(0)
  })

  it('ignores a uuid planted in sessionStorage by a duplicated tab', () => {
    const copied = '11111111-1111-4111-8111-111111111111'
    sessionStorage.setItem('quiz-device-id', copied)
    expect(getQuizDeviceId()).not.toBe(copied)
  })

  it('builds a v4-shaped id from getRandomValues when crypto.randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((a: Uint8Array) => a.fill(0xff))
    vi.stubGlobal('crypto', { getRandomValues })
    expect(getQuizDeviceId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(getRandomValues).toHaveBeenCalledOnce()
  })
})
