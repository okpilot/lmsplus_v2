import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

import { readInvigilatorOptions } from './invigilator-reads'

type Result = { data: unknown; error: { message: string } | null }

function chain(result: Result) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'order']) b[m] = vi.fn().mockReturnValue(b)
  b.maybeSingle = vi.fn().mockResolvedValue(result)
  // biome-ignore lint/suspicious/noThenProperty: thenable query builder mock
  b.then = (cb: (v: unknown) => unknown) => Promise.resolve(result).then(cb)
  return b as Record<string, ReturnType<typeof vi.fn>>
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('readInvigilatorOptions', () => {
  it('lists active admins and instructors of the organization with role labels', async () => {
    const b = chain({
      data: [
        { id: 'u1', full_name: 'Ann', email: 'a@x.io', role: 'instructor' },
        { id: 'u2', full_name: null, email: 'b@x.io', role: 'admin' },
        { id: 'u3', full_name: null, email: null, role: 'admin' },
      ],
      error: null,
    })
    mockFrom.mockReturnValue(b)
    expect(await readInvigilatorOptions('org-1')).toEqual([
      { id: 'u1', name: 'Ann (instructor)' },
      { id: 'u2', name: 'b@x.io (admin)' },
      { id: 'u3', name: 'Unknown (admin)' },
    ])
    expect(b.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(b.in).toHaveBeenCalledWith('role', ['admin', 'instructor'])
    expect(b.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('returns an empty list when there are no rows', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }))
    expect(await readInvigilatorOptions('org-1')).toEqual([])
  })

  it('throws when the read fails', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    await expect(readInvigilatorOptions('org-1')).rejects.toThrow('Failed to load invigilators')
  })
})
