import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

const mockRequireAdmin = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { readInvigilator, staffName } from './invigilator-lookup'

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
  mockRequireAdmin.mockResolvedValue({ organizationId: 'org-1', userId: 'admin-1' })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('readInvigilator', () => {
  it('returns an active invigilator through the admin client, scoped by organization and id', async () => {
    const b = row({})
    mockFrom.mockReturnValue(b)
    expect(await readInvigilator('user-1')).toEqual({ name: 'Ann', active: true })
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(b.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(b.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('scopes the read by the organization requireAdmin returned', async () => {
    mockRequireAdmin.mockResolvedValue({ organizationId: 'org-9', userId: 'admin-1' })
    const b = row({})
    mockFrom.mockReturnValue(b)
    await readInvigilator('user-1')
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1)
    expect(b.eq).toHaveBeenCalledWith('organization_id', 'org-9')
  })

  it('rejects without touching the database when requireAdmin rejects', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('forbidden'))
    await expect(readInvigilator('user-1')).rejects.toThrow('forbidden')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('falls back to the email, then Unknown, when full_name is null', async () => {
    mockFrom.mockReturnValueOnce(row({ full_name: null, email: 'a@x.io', role: 'admin' }))
    expect((await readInvigilator('u'))?.name).toBe('a@x.io')
    mockFrom.mockReturnValueOnce(row({ full_name: null, role: 'admin' }))
    expect((await readInvigilator('u'))?.name).toBe('Unknown')
  })

  it.each([
    ['soft-deleted', { role: 'admin', deleted_at: '2026-01-01T00:00:00Z' }],
    ['student role', { role: 'student' }],
  ])('marks a %s user inactive', async (_l, extra) => {
    mockFrom.mockReturnValue(row(extra))
    expect(await readInvigilator('u')).toEqual({ name: 'Ann', active: false })
  })

  it('returns null when the user does not exist in the organization', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }))
    expect(await readInvigilator('u')).toBeNull()
  })

  it('throws when the read fails', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    await expect(readInvigilator('u')).rejects.toThrow('Failed to load sitting')
  })
})

describe('staffName', () => {
  it('prefers the full name, then the email, then Unknown', () => {
    expect(staffName({ full_name: 'Ann', email: 'a@x.test' })).toBe('Ann')
    expect(staffName({ full_name: null, email: 'a@x.test' })).toBe('a@x.test')
    expect(staffName({ full_name: null, email: null })).toBe('Unknown')
  })
})
