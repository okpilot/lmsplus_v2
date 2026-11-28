import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  results: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  groups: vi.fn(),
}))

function chain(table: string) {
  const result = () => Promise.resolve(h.results[table])
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'is', 'eq']) c[m] = () => c
  // subjects ends at order(); sittings ends at limit()
  c.order = () => (table === 'easa_subjects' ? result() : c)
  c.limit = result
  return c
}

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: async () => ({ supabase: { from: chain }, organizationId: 'org-1' }),
}))
vi.mock('../students/queries', () => ({ getGroupOptions: h.groups }))

import { getAttemptFilterOptions } from './attempt-filter-options'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.groups.mockResolvedValue([{ id: 'g1', name: 'Cohort A' }])
  h.results = {
    easa_subjects: { data: [{ id: 's1', name: 'Air Law' }], error: null },
    exam_sittings: {
      data: [{ id: 'x1', scheduled_at: '2026-05-01T09:00:00.000Z', mode: 'in_person' }],
      error: null,
    },
  }
})

describe('getAttemptFilterOptions', () => {
  it('returns subjects, labelled sittings and groups', async () => {
    const r = await getAttemptFilterOptions()
    expect(r.subjects).toEqual([{ id: 's1', name: 'Air Law' }])
    expect(r.groups).toEqual([{ id: 'g1', name: 'Cohort A' }])
    expect(r.sittings[0]?.id).toBe('x1')
    expect(r.sittings[0]?.label).toMatch(/01\/05\/2026.*In person/)
  })

  it('labels a cancelled sitting and leaves a live one unchanged', async () => {
    h.results.exam_sittings = {
      data: [
        { id: 'x1', scheduled_at: '2026-05-01T09:00:00.000Z', mode: 'in_person', deleted_at: null },
        {
          id: 'x2',
          scheduled_at: '2026-05-01T09:00:00.000Z',
          mode: 'in_person',
          deleted_at: '2026-05-02T09:00:00.000Z',
        },
      ],
      error: null,
    }
    const r = await getAttemptFilterOptions()
    const live = r.sittings[0]?.label ?? ''
    expect(live).toBe('01/05/2026, 09:00 UTC In person')
    expect(r.sittings[1]?.label).toBe(`${live} · Cancelled`)
  })

  it('throws when a read fails', async () => {
    h.results.exam_sittings = { data: null, error: { message: 'boom' } }
    await expect(getAttemptFilterOptions()).rejects.toThrow('Failed to load attempt filter options')
  })
})
