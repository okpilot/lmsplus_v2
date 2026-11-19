import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))
vi.mock('./admin-supabase', () => ({ getAdminClient: mockGetAdminClient }))

import { EXAM_SITTING_SEED_PREFIX } from './exam-sitting-markers'
import {
  ensureEnrolment,
  insertLegacyCodeFor,
  issueSittingCodeFor,
  seedSittingFor,
} from './sitting-code'

type Insert = { table: string; rows: Record<string, unknown>[] }

function fakeAdmin(failInsertOn?: string) {
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
      return table === failInsertOn
        ? { error: { message: 'boom' }, data: null, select: () => api }
        : api
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

const STUDENT = { studentEmail: 'student@lmsplus.local', subjectFragment: 'Flight' }

describe('issueSittingCodeFor no-code guard', () => {
  it('throws when the seed returns no code', async () => {
    fakeAdmin()
    const input = { ...STUDENT, withCode: false }
    await expect(issueSittingCodeFor(input)).rejects.toThrow('issueSittingCodeFor: no code seeded')
  })
})

describe('seedSittingFor', () => {
  it('scheduled sitting has no started_at', async () => {
    const inserts = fakeAdmin()
    await seedSittingFor({ ...STUDENT, status: 'scheduled' })
    const sitting = inserts.find((i) => i.table === 'exam_sittings')
    expect(sitting?.rows[0]).not.toHaveProperty('started_at')
  })

  it('withCode:false inserts no code and returns code null', async () => {
    const inserts = fakeAdmin()
    const res = await seedSittingFor({ ...STUDENT, withCode: false })
    expect(inserts.some((i) => i.table === 'exam_sitting_entries')).toBe(true)
    expect(inserts.some((i) => i.table === 'internal_exam_codes')).toBe(false)
    expect(res.code).toBeNull()
  })

  it('fails loudly when the code insert errors', async () => {
    fakeAdmin('internal_exam_codes')
    await expect(seedSittingFor(STUDENT)).rejects.toThrow('issueSittingCodeFor code: boom')
  })
})

describe('insertLegacyCodeFor', () => {
  it('inserts a code without sitting_entry_id and returns it', async () => {
    const inserts = fakeAdmin()
    const code = await insertLegacyCodeFor(STUDENT)
    const row = inserts.find((i) => i.table === 'internal_exam_codes')?.rows[0]
    expect(row).toMatchObject({ code, student_id: expect.any(String) })
    expect(row).not.toHaveProperty('sitting_entry_id')
    expect(code).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('fails loudly when the insert errors', async () => {
    fakeAdmin('internal_exam_codes')
    await expect(insertLegacyCodeFor(STUDENT)).rejects.toThrow(
      'issueSittingCodeFor legacy code: boom',
    )
  })
})

describe('ensureEnrolment', () => {
  const ARGS = { orgId: 'o', adminId: 'a', userId: 'u', courseId: 'c' }

  /** Fake whose lookup and insert return the given results. */
  function enrolAdmin(
    lookup: { data: { id: string } | null; error: { message: string } | null },
    insert: { data: { id: string } | null; error: { message: string } | null } = {
      data: { id: 'new-1' },
      error: null,
    },
  ) {
    const inserted: unknown[] = []
    const api: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'limit']) api[m] = () => api
    api.maybeSingle = () => Promise.resolve(lookup)
    api.insert = (row: unknown) => {
      inserted.push(row)
      return api
    }
    api.single = () => Promise.resolve(insert)
    return { admin: { from: () => api } as never, inserted }
  }

  it('returns the existing enrolment without inserting', async () => {
    const { admin, inserted } = enrolAdmin({ data: { id: 'old-1' }, error: null })
    await expect(ensureEnrolment(admin, ARGS)).resolves.toEqual({ created: false, id: 'old-1' })
    expect(inserted).toHaveLength(0)
  })

  it('inserts and reports the new enrolment id when none exists', async () => {
    const { admin, inserted } = enrolAdmin({ data: null, error: null })
    await expect(ensureEnrolment(admin, ARGS)).resolves.toEqual({ created: true, id: 'new-1' })
    expect(inserted[0]).toMatchObject({ user_id: 'u', course_id: 'c', enrolled_by: 'a' })
  })

  it('fails loudly when the lookup errors', async () => {
    const { admin } = enrolAdmin({ data: null, error: { message: 'look' } })
    await expect(ensureEnrolment(admin, ARGS)).rejects.toThrow('enrolment lookup: look')
  })

  it('fails loudly when the insert errors', async () => {
    const { admin } = enrolAdmin(
      { data: null, error: null },
      { data: null, error: { message: 'ins' } },
    )
    await expect(ensureEnrolment(admin, ARGS)).rejects.toThrow('issueSittingCodeFor enrolment: ins')
  })
})
