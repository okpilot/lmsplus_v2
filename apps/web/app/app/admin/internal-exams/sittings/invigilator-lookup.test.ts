import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

import { readInvigilator } from './invigilator-lookup'

type Result = { data: unknown; error: { message: string } | null }

function chain(result: Result) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) b[m] = vi.fn().mockReturnValue(b)
  b.maybeSingle = vi.fn().mockResolvedValue(result)
  return b as Record<string, ReturnType<typeof vi.fn>>
}

const row = (extra: Record<string, unknown>) =>
  chain({
    data: { full_name: 'Ann', email: null, role: 'instructor', deleted_at: null, ...extra },
    error: null,
  })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('readInvigilator', () => {
  it('returns an active invigilator through the admin client, scoped by organization and id', async () => {
    const b = row({})
    mockFrom.mockReturnValue(b)
    expect(await readInvigilator('org-1', 'user-1')).toEqual({ name: 'Ann', active: true })
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(b.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(b.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('falls back to the email, then Unknown, when full_name is null', async () => {
    mockFrom.mockReturnValueOnce(row({ full_name: null, email: 'a@x.io', role: 'admin' }))
    expect((await readInvigilator('org-1', 'u'))?.name).toBe('a@x.io')
    mockFrom.mockReturnValueOnce(row({ full_name: null, role: 'admin' }))
    expect((await readInvigilator('org-1', 'u'))?.name).toBe('Unknown')
  })

  it.each([
    ['soft-deleted', { role: 'admin', deleted_at: '2026-01-01T00:00:00Z' }],
    ['student role', { role: 'student' }],
  ])('marks a %s user inactive', async (_l, extra) => {
    mockFrom.mockReturnValue(row(extra))
    expect(await readInvigilator('org-1', 'u')).toEqual({ name: 'Ann', active: false })
  })

  it('returns null when the user does not exist in the organization', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }))
    expect(await readInvigilator('org-1', 'u')).toBeNull()
  })

  it('throws when the read fails', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    await expect(readInvigilator('org-1', 'u')).rejects.toThrow('Failed to load sitting')
  })
})
