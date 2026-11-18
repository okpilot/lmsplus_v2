import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

import { readUserNames } from './people-lookup'

function chain(result: { data: unknown; error: { message: string } | null }) {
  const b = Promise.resolve(result) as unknown as Record<string, unknown>
  for (const m of ['select', 'eq', 'in', 'is']) b[m] = vi.fn().mockReturnValue(b)
  return b as Record<string, ReturnType<typeof vi.fn>>
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('readUserNames', () => {
  it('reads users through the admin client with organization and id predicates and no deleted filter', async () => {
    const b = chain({
      data: [
        { id: 'u1', full_name: 'Ann', email: 'a@x.io' },
        { id: 'u2', full_name: null, email: 'b@x.io' },
        { id: 'u3', full_name: null, email: null },
      ],
      error: null,
    })
    mockFrom.mockReturnValue(b)
    const r = await readUserNames('org-1', ['u1', 'u2', 'u3'])
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(b.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(b.in).toHaveBeenCalledWith('id', ['u1', 'u2', 'u3'])
    expect(b.is).not.toHaveBeenCalled()
    expect(r.get('u1')).toBe('Ann')
    expect(r.get('u2')).toBe('b@x.io')
    expect(r.get('u3')).toBe('Unknown')
  })

  it('does not call the database for no ids', async () => {
    expect((await readUserNames('org-1', [])).size).toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('logs and throws when the read fails', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'x' } }))
    await expect(readUserNames('org-1', ['u1'])).rejects.toThrow('Failed to load people')
  })
})
