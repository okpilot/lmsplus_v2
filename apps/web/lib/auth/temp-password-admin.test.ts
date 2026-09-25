import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockAdminFrom } = vi.hoisted(() => ({
  mockAdminFrom: vi.fn(),
}))

vi.mock('@repo/db/admin', () => ({
  adminClient: {
    from: mockAdminFrom,
  },
}))

// ---- Subject under test ---------------------------------------------------

import { armTempPassword, clearTempPassword, TEMP_PASSWORD_TTL_MS } from './temp-password-admin'

// ---- Helpers ----------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('clearTempPassword', () => {
  it('reports success when a row is updated', async () => {
    mockAdminFrom.mockImplementation(() => buildChain({ data: [{ id: USER_ID }], error: null }))

    await expect(clearTempPassword(USER_ID)).resolves.toEqual({ success: true })
  })

  it('reports failure and logs when the update returns an error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminFrom.mockImplementation(() =>
      buildChain({ data: null, error: { message: 'db unreachable' } }),
    )

    await expect(clearTempPassword(USER_ID)).resolves.toEqual({ success: false })
    expect(consoleSpy).toHaveBeenCalledWith('[clearTempPassword] update failed:', 'db unreachable')
    consoleSpy.mockRestore()
  })

  it('reports failure and logs when zero rows are updated', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminFrom.mockImplementation(() => buildChain({ data: [], error: null }))

    await expect(clearTempPassword(USER_ID)).resolves.toEqual({ success: false })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[clearTempPassword] zero rows updated for user:',
      USER_ID,
    )
    consoleSpy.mockRestore()
  })
})

describe('armTempPassword', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-arms the expiry roughly TEMP_PASSWORD_TTL_MS ahead when a row is updated', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T00:00:00.000Z'))
    const mockUpdate = vi.fn().mockReturnValue(buildChain({ data: [{ id: USER_ID }], error: null }))
    mockAdminFrom.mockReturnValue({ update: mockUpdate })

    await expect(armTempPassword(USER_ID)).resolves.toEqual({ success: true })

    const payload = mockUpdate.mock.calls[0]?.[0] as { temp_password_expires_at: string }
    expect(Date.parse(payload.temp_password_expires_at)).toBe(Date.now() + TEMP_PASSWORD_TTL_MS)
  })

  it('reports failure and logs when the update returns an error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminFrom.mockImplementation(() =>
      buildChain({ data: null, error: { message: 'db unreachable' } }),
    )

    await expect(armTempPassword(USER_ID)).resolves.toEqual({ success: false })
    expect(consoleSpy).toHaveBeenCalledWith('[armTempPassword] update failed:', 'db unreachable')
    consoleSpy.mockRestore()
  })

  it('reports failure and logs when zero rows are updated', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminFrom.mockImplementation(() => buildChain({ data: [], error: null }))

    await expect(armTempPassword(USER_ID)).resolves.toEqual({ success: false })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[armTempPassword] zero rows updated for user:',
      USER_ID,
    )
    consoleSpy.mockRestore()
  })
})
