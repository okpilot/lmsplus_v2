import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))
vi.mock('./admin-supabase', () => ({ getAdminClient: mockGetAdminClient }))

import { EXAM_SITTING_SEED_PREFIX } from './exam-sitting-markers'
import { insertLegacyCodeFor, issueSittingCodeFor, seedSittingFor } from './sitting-code'

type Insert = { table: string; rows: Record<string, unknown>[] }

function fakeAdmin(failInsertOn?: string) {
  const inserts: Insert[] = []
  let n = 0
  const builder = (table: string) => {
    const api: Record<string, unknown> = {}
    const row = () => ({
      id: `id-${++n}`,
      short: 'FPM',
      full_name: 'Fixture Student',
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
    await expect(seedSittingFor(STUDENT)).rejects.toThrow('sitting-code code: boom')
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
    await expect(insertLegacyCodeFor(STUDENT)).rejects.toThrow('sitting-code legacy code: boom')
  })
})

/**
 * Per-table response QUEUES. The two `users` lookups in `lookupIds` are the same table and the
 * same terminal call, so only call order can tell them apart — a table-keyed single response
 * cannot fail the student lookup while the admin lookup succeeds.
 */
type Resp = { data: unknown; error: { message: string } | null }

function fakeAdminSeq(queues: Record<string, Resp[]>) {
  const calls: string[] = []
  const take = (table: string): Resp => {
    const q = queues[table]
    if (!q || q.length === 0) throw new Error(`fakeAdminSeq: no queued response for ${table}`)
    return q.shift() as Resp
  }
  const builder = (table: string) => {
    const api: Record<string, unknown> = {}
    for (const m of ['eq', 'is', 'in', 'order', 'limit', 'like', 'ilike', 'neq']) {
      api[m] = () => api
    }
    // Recorded, unlike the filters: on a mutation `.select()` is what makes the affected rows
    // observable, so dropping it is a behaviour change a test must be able to see.
    api.select = () => {
      calls.push(`select:${table}`)
      return api
    }
    api.insert = () => {
      calls.push(`insert:${table}`)
      return api
    }
    api.update = () => {
      calls.push(`update:${table}`)
      return api
    }
    api.single = () => Promise.resolve(take(table))
    api.maybeSingle = () => Promise.resolve(take(table))
    // biome-ignore lint/suspicious/noThenProperty: awaitable mock
    api.then = (r: (v: unknown) => void) => Promise.resolve(take(table)).then(r)
    return api
  }
  mockGetAdminClient.mockReturnValue({ from: builder })
  return calls
}

const ok = (data: unknown): Resp => ({ data, error: null })
const boom = (message: string): Resp => ({ data: null, error: { message } })
const ADMIN_ROW = { id: 'admin-1', organization_id: 'org-1' }
const STUDENT_ROW = { id: 'stu-1', full_name: 'Fixture Student' }
const SUBJECT_ROW = { id: 'subj-1', course_id: 'course-1' }
const issueFor = () =>
  issueSittingCodeFor({ studentEmail: 'stu@test.local', subjectFragment: 'Flight Planning' })

describe('lookupIds error paths', () => {
  it('fails on the admin lookup', async () => {
    fakeAdminSeq({ users: [boom('no admin')] })
    await expect(issueFor()).rejects.toThrow('sitting-code admin lookup: no admin')
  })

  it('fails on the student lookup', async () => {
    fakeAdminSeq({ users: [ok(ADMIN_ROW), boom('no student')] })
    await expect(issueFor()).rejects.toThrow('sitting-code student lookup: no student')
  })

  it('fails on the subject lookup', async () => {
    fakeAdminSeq({
      users: [ok(ADMIN_ROW), ok(STUDENT_ROW)],
      easa_subjects: [boom('no subject')],
    })
    await expect(issueFor()).rejects.toThrow('sitting-code subject lookup: no subject')
  })

  it('fails when the student row carries no full_name, which row locators need', async () => {
    fakeAdminSeq({
      users: [ok(ADMIN_ROW), ok({ id: 'stu-1', full_name: null })],
      easa_subjects: [ok(SUBJECT_ROW)],
    })
    await expect(issueFor()).rejects.toThrow('student full_name')
  })
})

describe('ensureEnrolment error paths', () => {
  it('fails on the enrolment lookup', async () => {
    fakeAdminSeq({
      users: [ok(ADMIN_ROW), ok(STUDENT_ROW)],
      easa_subjects: [ok(SUBJECT_ROW)],
      course_enrolments: [boom('lookup down')],
    })
    await expect(issueFor()).rejects.toThrow('sitting-code enrolment lookup: lookup down')
  })

  it('fails on the enrolment insert', async () => {
    fakeAdminSeq({
      users: [ok(ADMIN_ROW), ok(STUDENT_ROW)],
      easa_subjects: [ok(SUBJECT_ROW)],
      course_enrolments: [ok(null), boom('insert down')],
    })
    await expect(issueFor()).rejects.toThrow('sitting-code enrolment: insert down')
  })
})

describe('releaseSeededEnrolments', () => {
  it('stays silent, and touches no client, when this run seeded none', async () => {
    vi.resetModules()
    const calls = fakeAdminSeq({})
    const fresh = await import('./sitting-code')
    await expect(fresh.releaseSeededEnrolments()).resolves.toBeUndefined()
    expect(calls).toEqual([])
    expect(mockGetAdminClient).not.toHaveBeenCalled()
  })

  it('soft-deletes the enrolment it seeded, then forgets it', async () => {
    vi.resetModules()
    const fresh = await import('./sitting-code')
    const calls = fakeAdminSeq({
      users: [ok(ADMIN_ROW), ok(STUDENT_ROW)],
      easa_subjects: [ok(SUBJECT_ROW)],
      course_enrolments: [ok(null), ok({ id: 'enr-1' })],
      exam_sittings: [ok({ id: 'sit-1' })],
      exam_sitting_candidates: [ok({ id: 'cand-1' })],
      exam_sitting_entries: [ok({ id: 'entry-1' })],
      internal_exam_codes: [ok({ id: 'code-1', code: 'ABC12345' })],
    })
    await fresh.issueSittingCodeFor({
      studentEmail: 'stu@test.local',
      subjectFragment: 'Flight Planning',
    })

    const release = fakeAdminSeq({ course_enrolments: [ok([{ id: 'enr-1' }])] })
    await fresh.releaseSeededEnrolments()
    expect(release).toContain('update:course_enrolments')
    // Without the `.select('id')` the update cannot report how many rows it touched.
    expect(release).toContain('select:course_enrolments')

    // Second call: the set was cleared, so it is a no-op rather than a repeat update.
    const again = fakeAdminSeq({})
    await fresh.releaseSeededEnrolments()
    expect(again).toEqual([])
    expect(calls.length).toBeGreaterThan(0)
  })

  it('fails loudly when the release update errors', async () => {
    vi.resetModules()
    const fresh = await import('./sitting-code')
    fakeAdminSeq({
      users: [ok(ADMIN_ROW), ok(STUDENT_ROW)],
      easa_subjects: [ok(SUBJECT_ROW)],
      course_enrolments: [ok(null), ok({ id: 'enr-1' })],
      exam_sittings: [ok({ id: 'sit-1' })],
      exam_sitting_candidates: [ok({ id: 'cand-1' })],
      exam_sitting_entries: [ok({ id: 'entry-1' })],
      internal_exam_codes: [ok({ id: 'code-1', code: 'ABC12345' })],
    })
    await fresh.issueSittingCodeFor({
      studentEmail: 'stu@test.local',
      subjectFragment: 'Flight Planning',
    })

    fakeAdminSeq({ course_enrolments: [boom('release down')] })
    await expect(fresh.releaseSeededEnrolments()).rejects.toThrow(
      'sitting-code seeded enrolment release: release down',
    )
  })

  // Supabase returns 200 with zero rows on a filter miss, so without the `.select('id')` the
  // helper cannot tell a restore from a no-op. Zero rows is not a fault here (the row may have
  // been soft-deleted elsewhere already), so the no-op warns and the set still clears.
  it('warns instead of throwing when no live enrolment row matched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.resetModules()
    const fresh = await import('./sitting-code')
    fakeAdminSeq({
      users: [ok(ADMIN_ROW), ok(STUDENT_ROW)],
      easa_subjects: [ok(SUBJECT_ROW)],
      course_enrolments: [ok(null), ok({ id: 'enr-1' })],
      exam_sittings: [ok({ id: 'sit-1' })],
      exam_sitting_candidates: [ok({ id: 'cand-1' })],
      exam_sitting_entries: [ok({ id: 'entry-1' })],
      internal_exam_codes: [ok({ id: 'code-1', code: 'ABC12345' })],
    })
    await fresh.issueSittingCodeFor({
      studentEmail: 'stu@test.local',
      subjectFragment: 'Flight Planning',
    })

    const release = fakeAdminSeq({ course_enrolments: [ok([])] })
    await expect(fresh.releaseSeededEnrolments()).resolves.toBeUndefined()
    expect(release).toContain('select:course_enrolments')
    expect(warn).toHaveBeenCalledWith('[releaseSeededEnrolments] no live row for 1 seeded id(s)')

    // The set cleared despite the no-op, so a second teardown does not retry it.
    const again = fakeAdminSeq({})
    await fresh.releaseSeededEnrolments()
    expect(again).toEqual([])
  })
})
