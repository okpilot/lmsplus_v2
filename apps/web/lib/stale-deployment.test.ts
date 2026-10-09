import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isStaleDeploymentError, reloadOnceForStaleDeployment } from './stale-deployment'

describe('isStaleDeploymentError', () => {
  it('recognises a ChunkLoadError by name', () => {
    const error = new Error('boom')
    error.name = 'ChunkLoadError'
    expect(isStaleDeploymentError(error)).toBe(true)
  })

  it.each([
    'Module factory is not available',
    'Loading chunk 123 failed.',
    'Failed to load chunk /_next/static/x.js',
    'Failed to fetch dynamically imported module: https://x/y.js',
    'Importing a module script failed.',
  ])('recognises the message "%s"', (message) => {
    expect(isStaleDeploymentError(new Error(message))).toBe(true)
  })

  it('rejects unrelated errors', () => {
    expect(isStaleDeploymentError(new Error('Something broke'))).toBe(false)
  })

  it('rejects non-object values', () => {
    expect(isStaleDeploymentError('Loading chunk 1 failed')).toBe(false)
    expect(isStaleDeploymentError(null)).toBe(false)
    expect(isStaleDeploymentError(undefined)).toBe(false)
  })

  it('rejects objects without a string message', () => {
    expect(isStaleDeploymentError({ message: 5 })).toBe(false)
  })
})

describe('reloadOnceForStaleDeployment', () => {
  const reload = vi.fn()
  const KEY = 'lmsplus:stale-reload-at'

  function setLocation(pathname: string) {
    vi.stubGlobal('location', { pathname, reload })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useRealTimers()
    sessionStorage.clear()
    setLocation('/app/dashboard')
  })

  it('reloads and records the time on the first stale error', () => {
    expect(reloadOnceForStaleDeployment()).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(KEY)).not.toBeNull()
  })

  it('does not reload again within a minute', () => {
    sessionStorage.setItem(KEY, String(Date.now() - 1_000))
    expect(reloadOnceForStaleDeployment()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads again once a minute has passed', () => {
    sessionStorage.setItem(KEY, String(Date.now() - 61_000))
    expect(reloadOnceForStaleDeployment()).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('never reloads on a live quiz session page', () => {
    setLocation('/app/quiz/session/abc')
    expect(reloadOnceForStaleDeployment()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload when session storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(reloadOnceForStaleDeployment()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
