import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('@repo/db/client', () => ({
  createClient: () => ({ auth: { getUser: (...a: unknown[]) => mockGetUser(...a) } }),
}))

import { classifyFailure, linkIsDown, PROBE_TIMEOUT_MS } from './classify-failure'

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
    await expect(classifyFailure()).resolves.toBe('offline')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('reports offline without probing when the call threw a TypeError', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    await expect(classifyFailure(new TypeError('Failed to fetch'))).resolves.toBe('offline')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('reports server when the call threw a plain error and the session is good', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    await expect(classifyFailure(new Error('boom'))).resolves.toBe('server')
  })

  it('reports offline when the auth probe fails on a retryable fetch error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('fetch failed', 0),
    })
    await expect(classifyFailure()).resolves.toBe('offline')
  })

  it('reports offline when the auth probe error has status 0', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { status: 0, name: 'X' } })
    await expect(classifyFailure()).resolves.toBe('offline')
  })

  it('reports offline when the auth probe does not answer in time', async () => {
    vi.useFakeTimers()
    mockGetUser.mockReturnValue(new Promise(() => {}))
    const result = classifyFailure()
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    await expect(result).resolves.toBe('offline')
  })

  it('reports signed-out when the auth probe has a 401 error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { status: 401, name: 'X' } })
    await expect(classifyFailure()).resolves.toBe('signed-out')
  })

  it('reports signed-out when the auth probe finds no session', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { status: 400, name: 'AuthSessionMissingError' },
    })
    await expect(classifyFailure()).resolves.toBe('signed-out')
  })

  it('reports signed-out when the refresh token is dead', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { status: 400, name: 'AuthApiError', code: 'refresh_token_already_used' },
    })
    await expect(classifyFailure()).resolves.toBe('signed-out')
  })

  it('reports server when the auth probe fails with a 500', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { status: 500, name: 'X' } })
    await expect(classifyFailure()).resolves.toBe('server')
  })

  it('reports signed-out when the auth probe finds no user and no error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(classifyFailure()).resolves.toBe('signed-out')
  })

  it('reports server when the auth probe finds a signed-in user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    await expect(classifyFailure()).resolves.toBe('server')
  })

  it('reports server when the auth probe itself throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetUser.mockRejectedValue(new Error('unexpected'))
    await expect(classifyFailure()).resolves.toBe('server')
  })

  it("passes the server's answer through when the server answered but the auth probe times out", async () => {
    vi.useFakeTimers()
    mockGetUser.mockReturnValue(new Promise(() => {}))
    const result = classifyFailure(undefined, true)
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    await expect(result).resolves.toBe('server')
  })

  it('still reports offline when the server answered but the browser is offline', async () => {
    setOnLine(false)
    await expect(classifyFailure(undefined, true)).resolves.toBe('offline')
  })

  it('reports offline when the server answered but the auth probe cannot reach the network', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })
    await expect(classifyFailure(undefined, true)).resolves.toBe('offline')
  })

  it('reports offline when the call failed without a server answer and the probe times out', async () => {
    vi.useFakeTimers()
    mockGetUser.mockReturnValue(new Promise(() => {}))
    const result = classifyFailure(new Error('x'), false)
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    await expect(result).resolves.toBe('offline')
  })

  it('reports server when the server answered and the session is still good', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    await expect(classifyFailure(undefined, true)).resolves.toBe('server')
  })

  it('reports signed-out when the server answered and there is no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(classifyFailure(undefined, true)).resolves.toBe('signed-out')
  })
})

describe('linkIsDown', () => {
  it('is true when the browser is offline', async () => {
    setOnLine(false)
    await expect(linkIsDown()).resolves.toBe(true)
  })

  it('is false when the auth probe does not answer in time', async () => {
    vi.useFakeTimers()
    mockGetUser.mockReturnValue(new Promise(() => {}))
    const result = linkIsDown()
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    await expect(result).resolves.toBe(false)
  })

  it('is false when the auth probe reaches the server', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    await expect(linkIsDown()).resolves.toBe(false)
  })
})
