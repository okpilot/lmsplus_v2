import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetQuizDeviceId, getQuizDeviceId, QUIZ_DEVICE_ID_KEY } from './quiz-device-id'

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
  it('creates a uuid, persists it in sessionStorage and returns the same one afterwards', () => {
    const id = getQuizDeviceId()
    expect(id).toMatch(V4)
    expect(sessionStorage.getItem(QUIZ_DEVICE_ID_KEY)).toBe(id)
    expect(getQuizDeviceId()).toBe(id)
  })

  it('reuses the id already stored for this tab', () => {
    const stored = '11111111-1111-4111-8111-111111111111'
    sessionStorage.setItem(QUIZ_DEVICE_ID_KEY, stored)
    expect(getQuizDeviceId()).toBe(stored)
  })

  it('replaces a stored value that is not a uuid', () => {
    sessionStorage.setItem(QUIZ_DEVICE_ID_KEY, 'garbage')
    expect(getQuizDeviceId()).toMatch(V4)
  })

  it('builds a v4-shaped id when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {})
    expect(getQuizDeviceId()).toMatch(V4)
  })

  it('keeps one stable in-memory id when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const id = getQuizDeviceId()
    expect(id).toMatch(V4)
    expect(getQuizDeviceId()).toBe(id)
  })
})
