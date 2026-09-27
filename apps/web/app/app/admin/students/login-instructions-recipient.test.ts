import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

// ---- Subject under test -------------------------------------------------------

import { getLoginInstructionsRecipient } from './login-instructions-recipient'

// ---- Helpers ------------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const ORG_ID = '00000000-0000-4000-a000-000000000002'

function buildChain({
  data = null,
  error = null,
}: {
  data?: unknown
  error?: { message: string; code?: string } | null
} = {}) {
  const builder: Record<string, unknown> = {}
  for (const fn of ['select', 'eq', 'is', 'in']) {
    builder[fn] = vi.fn().mockReturnValue(builder)
  }
  builder.single = vi.fn().mockResolvedValue({ data, error })
  mockFrom.mockReturnValue(builder)
  return builder
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getLoginInstructionsRecipient', () => {
  it('returns the mapped recipient for a matching row', async () => {
    buildChain({
      data: { email: 'alice@example.com', full_name: 'Alice', temp_password_expires_at: null },
    })

    const result = await getLoginInstructionsRecipient(USER_ID, ORG_ID)

    expect(result).toEqual({
      email: 'alice@example.com',
      fullName: 'Alice',
      tempPasswordExpiresAt: null,
    })
  })

  it('scopes the query to the id, the organization, an active row, and student/instructor roles', async () => {
    const chain = buildChain({
      data: { email: 'a@b.com', full_name: null, temp_password_expires_at: null },
    })

    await getLoginInstructionsRecipient(USER_ID, ORG_ID)

    expect(chain.eq).toHaveBeenCalledWith('id', USER_ID)
    expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID)
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(chain.in).toHaveBeenCalledWith('role', ['student', 'instructor'])
  })

  it('returns null when no row matches (PGRST116)', async () => {
    buildChain({ error: { message: 'no rows', code: 'PGRST116' } })

    const result = await getLoginInstructionsRecipient(USER_ID, ORG_ID)

    expect(result).toBeNull()
  })

  it('returns null and logs when the query fails with a non-404 error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    buildChain({ error: { message: 'connection reset', code: 'PGRST500' } })

    const result = await getLoginInstructionsRecipient(USER_ID, ORG_ID)

    expect(result).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(
      '[getLoginInstructionsRecipient] DB error:',
      'connection reset',
    )
    errorSpy.mockRestore()
  })

  it('returns null when the fetched data is null without an error', async () => {
    buildChain({ data: null })

    const result = await getLoginInstructionsRecipient(USER_ID, ORG_ID)

    expect(result).toBeNull()
  })

  it('returns the current temp-password expiry when one is set', async () => {
    buildChain({
      data: {
        email: 'a@b.com',
        full_name: 'A',
        temp_password_expires_at: '2026-09-20T00:00:00.000Z',
      },
    })

    const result = await getLoginInstructionsRecipient(USER_ID, ORG_ID)

    expect(result).toEqual({
      email: 'a@b.com',
      fullName: 'A',
      tempPasswordExpiresAt: '2026-09-20T00:00:00.000Z',
    })
  })
})
