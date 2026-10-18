import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, chain } = vi.hoisted(() => {
  const chain = {
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    select: vi.fn(),
  }
  return { mockFrom: vi.fn(), chain }
})

vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

import { clearPasswordPendingMarker } from './password-pending-marker'

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'

function arrangeResult(result: unknown) {
  mockFrom.mockReturnValue(chain)
  for (const name of ['update', 'eq', 'is', 'not'] as const) chain[name].mockReturnValue(chain)
  chain.select.mockResolvedValue(result)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('clearPasswordPendingMarker', () => {
  it('nulls the marker on the target live row only when one is set', async () => {
    arrangeResult({ data: [{ id: USER_ID }], error: null })

    await clearPasswordPendingMarker(USER_ID)

    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(chain.update).toHaveBeenCalledWith({ temp_password_expires_at: null })
    expect(chain.eq).toHaveBeenCalledWith('id', USER_ID)
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(chain.not).toHaveBeenCalledWith('temp_password_expires_at', 'is', null)
  })

  it('stays silent when no row carried a marker', async () => {
    arrangeResult({ data: [], error: null })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(clearPasswordPendingMarker(USER_ID)).resolves.toBeUndefined()

    expect(spy).not.toHaveBeenCalled()
  })

  it('logs the failure and resolves without throwing when the update errors', async () => {
    arrangeResult({ data: null, error: { message: 'boom' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(clearPasswordPendingMarker(USER_ID)).resolves.toBeUndefined()

    expect(spy).toHaveBeenCalledWith('[clearPasswordPendingMarker] update failed:', 'boom')
  })
})
