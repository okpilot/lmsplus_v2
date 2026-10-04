import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('@repo/db/client', () => ({
  createClient: () => ({ auth: { getUser: (...a: unknown[]) => mockGetUser(...a) } }),
}))

import { SIGN_IN } from '../../actions/progress-error-messages'
import { classifyFailure, PROBE_TIMEOUT_MS } from './classify-failure'

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

beforeEach(() => {
  vi.resetAllMocks()
  setOnLine(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('classifyFailure', () => {
  it('reports offline without probing when the browser is offline', async () => {
    setOnLine(false)
    await expect(classifyFailure(new TypeError('fetch failed'))).resolves.toBe('offline')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('reports signed-out for a sign-in failure result without probing', async () => {
    await expect(classifyFailure({ success: false, error: SIGN_IN })).resolves.toBe('signed-out')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('reports offline when the auth probe fails on a retryable fetch error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('fetch failed', 0),
    })
    await expect(classifyFailure(new TypeError('x'))).resolves.toBe('offline')
  })

  it('reports offline when the auth probe error has status 0', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { status: 0, name: 'X' } })
    await expect(classifyFailure(new TypeError('x'))).resolves.toBe('offline')
  })

  it('reports offline when the auth probe does not answer in time', async () => {
    vi.useFakeTimers()
    mockGetUser.mockReturnValue(new Promise(() => {}))
    const result = classifyFailure(new TypeError('x'))
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    await expect(result).resolves.toBe('offline')
  })

  it('reports signed-out when the auth probe returns a non-network auth error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { status: 401, name: 'X' } })
    await expect(classifyFailure(new Error('x'))).resolves.toBe('signed-out')
  })

  it('reports signed-out when the auth probe finds no user and no error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(classifyFailure({})).resolves.toBe('signed-out')
  })

  it('reports server when the auth probe finds a signed-in user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    await expect(classifyFailure(new Error('boom'))).resolves.toBe('server')
  })

  it('reports server when the auth probe itself throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetUser.mockRejectedValue(new Error('unexpected'))
    await expect(classifyFailure(new Error('boom'))).resolves.toBe('server')
  })
})
