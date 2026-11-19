import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))
vi.mock('./admin-supabase', () => ({ getAdminClient: mockGetAdminClient }))

import { EXAM_SITTING_SEED_PREFIX } from './exam-sitting-markers'
import { issueSittingCodeFor } from './sitting-code'

type Insert = { table: string; rows: Record<string, unknown>[] }

function fakeAdmin() {
  const inserts: Insert[] = []
  let n = 0
  const builder = (table: string) => {
    const api: Record<string, unknown> = {}
    const row = () => ({
      id: `id-${++n}`,
      short: 'FPM',
      name: 'Flight Planning',
      course_id: 'course-1',
      organization_id: 'org-1',
    })
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'like', 'ilike', 'neq']) {
      api[m] = () => api
    }
    api.insert = (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      inserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] })
      return api
    }
    api.single = () => Promise.resolve({ data: row(), error: null })
    api.maybeSingle = () => Promise.resolve({ data: row(), error: null })
    // biome-ignore lint/suspicious/noThenProperty: awaitable mock
    api.then = (r: (v: unknown) => void) => Promise.resolve({ data: [row()], error: null }).then(r)
    return api
  }
  mockGetAdminClient.mockReturnValue({ from: builder })
  return inserts
}

beforeEach(() => vi.resetAllMocks())

describe('issueSittingCodeFor', () => {
  it('seeds an open marked sitting for the existing user', async () => {
    const inserts = fakeAdmin()
    await issueSittingCodeFor({ studentEmail: 'student@lmsplus.local', subjectFragment: 'Flight' })
    const sitting = inserts.find((i) => i.table === 'exam_sittings')
    expect(sitting?.rows[0]).toMatchObject({
      permitted_materials: expect.stringContaining(EXAM_SITTING_SEED_PREFIX),
    })
    expect(sitting?.rows[0]?.started_at).toBeTruthy()
  })

  it('inserts an entry and a live code linked to it', async () => {
    const inserts = fakeAdmin()
    await issueSittingCodeFor({ studentEmail: 'student@lmsplus.local', subjectFragment: 'Flight' })
    expect(inserts.some((i) => i.table === 'exam_sitting_entries')).toBe(true)
    const code = inserts.find((i) => i.table === 'internal_exam_codes')
    expect(code?.rows[0]).toHaveProperty('sitting_entry_id')
  })

  it('returns the code value and the sitting id', async () => {
    fakeAdmin()
    const res = await issueSittingCodeFor({
      studentEmail: 'student@lmsplus.local',
      subjectFragment: 'Flight',
    })
    expect(res.code).toMatch(/^[A-Z0-9]{8}$/)
    expect(typeof res.sittingId).toBe('string')
  })
})
