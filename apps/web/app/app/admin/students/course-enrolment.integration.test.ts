// Course enrolment admin surface against real Postgres (#1636): list embed, getCourses,
// getStudentDetail.courses, create/update end-to-end, GDPR fetcher.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getStudentDetail } from '@/app/app/admin/dashboard/students/[id]/queries'
import { fetchCourseEnrolments } from '@/lib/gdpr/collect-user-data-queries'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { createStudent } from './actions/create-student'
import { updateStudent } from './actions/update-student'
import { getCourses, getStudentsList } from './queries'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'

const PPL = 'c0a5e000-0000-4000-8000-000000000001'
const RT = 'c0a5e000-0000-4000-8000-000000000002'
const ATPL = 'c0a5e000-0000-4000-8000-000000000003'

let orgAId: string | undefined
let orgBId: string | undefined
let adminAId: string | undefined
let adminBId: string | undefined
let studentId: string
let bareStudentId: string
let otherOrgStudentId: string
const createdIds: string[] = []

const adminAEmail = `int-ce-admin-a-${suffix}@test.local`
const adminBEmail = `int-ce-admin-b-${suffix}@test.local`
const studentEmail = `int-ce-student-${suffix}@test.local`

async function activeCourseIds(id: string): Promise<string[]> {
  const { data, error } = await admin
    .from('course_enrolments')
    .select('course_id')
    .eq('user_id', id)
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.course_id).sort()
}

describe('course enrolment admin surface (integration)', () => {
  beforeAll(async () => {
    orgAId = await createTestOrg({ admin, name: `ce A ${suffix}`, slug: `ce-a-${suffix}` })
    orgBId = await createTestOrg({ admin, name: `ce B ${suffix}`, slug: `ce-b-${suffix}` })
    adminAId = await createTestUser({
      admin,
      orgId: orgAId,
      email: adminAEmail,
      password,
      role: 'admin',
    })
    adminBId = await createTestUser({
      admin,
      orgId: orgBId,
      email: adminBEmail,
      password,
      role: 'admin',
    })
    studentId = await createTestUser({
      admin,
      orgId: orgAId,
      email: studentEmail,
      password,
      role: 'student',
    })
    bareStudentId = await createTestUser({
      admin,
      orgId: orgAId,
      email: `int-ce-bare-${suffix}@test.local`,
      password,
      role: 'student',
    })
    otherOrgStudentId = await createTestUser({
      admin,
      orgId: orgBId,
      email: `int-ce-other-${suffix}@test.local`,
      password,
      role: 'student',
    })
    // Deterministic state: clear any backfill, then PPL active, RT removed, for studentId.
    for (const id of [studentId, bareStudentId, otherOrgStudentId]) {
      await admin.from('course_enrolments').delete().eq('user_id', id)
    }
    const rows = [
      { organization_id: orgAId, user_id: studentId, course_id: PPL },
      {
        organization_id: orgAId,
        user_id: studentId,
        course_id: RT,
        deleted_at: new Date().toISOString(),
        deleted_by: adminAId,
      },
      { organization_id: orgBId, user_id: otherOrgStudentId, course_id: ATPL },
    ]
    const { error } = await admin.from('course_enrolments').insert(rows)
    if (error) throw new Error(error.message)
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      if (orgAId) {
        await cleanupTestData({
          admin,
          orgId: orgAId,
          userIds: [adminAId, studentId, bareStudentId, ...createdIds].filter(
            (id): id is string => id !== undefined,
          ),
        })
      }
    } catch (e) {
      errors.push(`A: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      if (orgBId) {
        await cleanupTestData({
          admin,
          orgId: orgBId,
          userIds: [adminBId, otherOrgStudentId].filter((id): id is string => id !== undefined),
        })
      }
    } catch (e) {
      errors.push(`B: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('getCourses returns the three courses ordered by sort_order', async () => {
    await signInAs(adminAEmail, password)
    const courses = await getCourses()
    expect(courses.map((c) => c.short)).toEqual(['PPL', 'RT', 'ATPL'])
    expect(courses[0]).toEqual({ id: PPL, short: 'PPL', name: 'PPL(A)' })
  })

  it('getStudentsList returns active course ids only, excluding removed enrolments', async () => {
    await signInAs(adminAEmail, password)
    const rows = await getStudentsList({})
    const row = rows.find((r) => r.id === studentId)
    expect(row?.course_ids).toEqual([PPL])
  })

  it('getStudentsList still lists a student with zero active enrolments', async () => {
    await signInAs(adminAEmail, password)
    const rows = await getStudentsList({})
    const row = rows.find((r) => r.id === bareStudentId)
    expect(row).toBeDefined()
    expect(row?.course_ids).toEqual([])
  })

  it('getStudentsList does not leak another organization students or enrolments', async () => {
    await signInAs(adminAEmail, password)
    const rows = await getStudentsList({})
    expect(rows.find((r) => r.id === otherOrgStudentId)).toBeUndefined()
  })

  it('getStudentDetail returns the active course short names', async () => {
    await signInAs(adminAEmail, password)
    const detail = await getStudentDetail(studentId)
    expect(detail?.courses).toEqual(['PPL'])
  })

  it('createStudent writes enrolments and an audit row for the chosen courses', async () => {
    await signInAs(adminAEmail, password)
    const result = await createStudent({
      email: `int-ce-new-${suffix}@test.local`,
      full_name: 'Int New',
      role: 'student',
      course_ids: [RT],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    createdIds.push(result.id)
    expect(await activeCourseIds(result.id)).toEqual([RT])
    const { data } = await admin
      .from('audit_events')
      .select('event_type')
      .eq('resource_id', result.id)
    expect((data ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('createStudent enrols an instructor in the chosen courses', async () => {
    await signInAs(adminAEmail, password)
    const result = await createStudent({
      email: `int-ce-instr-${suffix}@test.local`,
      full_name: 'Int Instructor',
      role: 'instructor',
      course_ids: [ATPL],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    createdIds.push(result.id)
    expect(await activeCourseIds(result.id)).toEqual([ATPL])
    const rows = await getStudentsList({})
    expect(rows.find((r) => r.id === result.id)?.course_ids).toEqual([ATPL])
  })

  it('updateStudent keeps enrolments when an instructor role changes to student', async () => {
    await signInAs(adminAEmail, password)
    const created = await createStudent({
      email: `int-ce-role-${suffix}@test.local`,
      full_name: 'Int Role',
      role: 'instructor',
      course_ids: [RT],
    })
    expect(created.success).toBe(true)
    if (!created.success) return
    createdIds.push(created.id)
    const result = await updateStudent({
      id: created.id,
      full_name: 'Int Role',
      role: 'student',
    })
    expect(result.success).toBe(true)
    expect(await activeCourseIds(created.id)).toEqual([RT])
  })

  it('updateStudent replaces the active enrolments and keeps removed rows as history', async () => {
    await signInAs(adminAEmail, password)
    const result = await updateStudent({
      id: studentId,
      full_name: 'Int Student',
      role: 'student',
      course_ids: [ATPL],
    })
    expect(result.success).toBe(true)
    expect(await activeCourseIds(studentId)).toEqual([ATPL])
    const { data } = await admin
      .from('course_enrolments')
      .select('course_id, deleted_at')
      .eq('user_id', studentId)
      .eq('course_id', PPL)
    expect((data ?? []).every((r) => r.deleted_at !== null)).toBe(true)
  })

  it('fetchCourseEnrolments returns active and removed rows for the admin client', async () => {
    const { data, error } = await fetchCourseEnrolments(admin, studentId)
    expect(error).toBeNull()
    expect(data.length).toBeGreaterThanOrEqual(3)
    expect(data.some((r) => r.deleted_at !== null)).toBe(true)
    expect(data.some((r) => r.deleted_at === null)).toBe(true)
  })

  it('fetchCourseEnrolments with the student own client returns active rows only', async () => {
    const client = await getAuthenticatedClient({ email: studentEmail, password })
    const { data, error } = await fetchCourseEnrolments(client, studentId)
    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)
    expect(data.every((r) => r.deleted_at === null)).toBe(true)
  })
})
