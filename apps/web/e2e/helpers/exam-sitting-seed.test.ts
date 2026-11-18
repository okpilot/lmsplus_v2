import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))
vi.mock('./admin-supabase', () => ({ getAdminClient: mockGetAdminClient }))

import { EXAM_SITTING_E2E_PREFIX } from './exam-sitting-markers'
import { seedSitting } from './exam-sitting-seed'

type Insert = { table: string; rows: Record<string, unknown>[] }

function fakeAdmin() {
  const inserts: Insert[] = []
  let n = 0
  const builder = (table: string) => {
    const api: Record<string, unknown> = {}
    const result = () => ({ data: [{ id: `id-${++n}`, short: 'FPM' }], error: null })
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'like', 'neq']) {
      api[m] = () => api
    }
    api.insert = (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] })
      return api
    }
    api.single = () => Promise.resolve({ data: { id: `id-${++n}` }, error: null })
    // biome-ignore lint/suspicious/noThenProperty: awaitable mock
    api.then = (r: (v: unknown) => void) => Promise.resolve(result()).then(r)
    return api
  }
  mockGetAdminClient.mockReturnValue({
    from: builder,
    auth: {
      admin: { createUser: async () => ({ data: { user: { id: `u-${++n}` } }, error: null }) },
    },
  })
  return inserts
}

beforeEach(() => vi.resetAllMocks())

describe('seedSitting', () => {
  it('inserts a sitting carrying the E2E-SIT- marker in permitted_materials', async () => {
    const inserts = fakeAdmin()
    await seedSitting({ people: [{ name: 'Ann', entries: [{ state: 'live' }] }] })
    const sitting = inserts.find((i) => i.table === 'exam_sittings')
    expect(String(sitting?.rows[0]?.permitted_materials)).toMatch(
      new RegExp(`^${EXAM_SITTING_E2E_PREFIX}`),
    )
  })

  it('seeds one candidate per person and one entry per listed exam', async () => {
    const inserts = fakeAdmin()
    await seedSitting({
      people: [
        { name: 'Ann', entries: [{ state: 'live' }, { state: 'no_code' }] },
        { name: 'Bea', entries: [] },
      ],
    })
    const cands = inserts
      .filter((i) => i.table === 'exam_sitting_candidates')
      .flatMap((i) => i.rows)
    const entries = inserts.filter((i) => i.table === 'exam_sitting_entries').flatMap((i) => i.rows)
    expect(cands).toHaveLength(2)
    expect(entries).toHaveLength(2)
  })

  it('returns the sitting id and the seeded people', async () => {
    fakeAdmin()
    const r = await seedSitting({ people: [{ name: 'Ann', entries: [] }] })
    expect(typeof r.sittingId).toBe('string')
    expect(r.people[0]).toMatchObject({ name: 'Ann' })
    expect(typeof r.people[0]?.userId).toBe('string')
  })
})
