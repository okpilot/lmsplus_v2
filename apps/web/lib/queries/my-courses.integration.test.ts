// App-layer integration tier — getMyCourses (AC9: own rows only, even for an admin).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { getMyCourses } from './my-courses'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-mc-admin-${suffix}@test.local`
const studentEmail = `int-mc-student-${suffix}@test.local`

let orgId: string
let adminId: string
let studentId: string
let pplId: string
let rtId: string

async function enrol(userId: string, courseId: string) {
  const { error } = await admin
    .from('course_enrolments')
    .insert({ organization_id: orgId, user_id: userId, course_id: courseId })
  if (error) throw new Error(`enrol: ${error.message}`)
}

describe('getMyCourses (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-mc ${suffix}`, slug: `int-mc-${suffix}` })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    studentId = await createTestUser({
      admin,
      orgId,
      email: studentEmail,
      password,
      role: 'student',
    })
    const { data, error } = await admin
      .from('courses')
      .select('id, code')
      .in('code', ['PPL_A', 'VFR_RT'])
    if (error || !data) throw new Error(`courses: ${error?.message}`)
    pplId = data.find((c) => c.code === 'PPL_A')?.id ?? ''
    rtId = data.find((c) => c.code === 'VFR_RT')?.id ?? ''
    for (const uid of [adminId, studentId]) {
      const { error: clr } = await admin
        .from('course_enrolments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', uid)
        .is('deleted_at', null)
      if (clr) throw new Error(`clear: ${clr.message}`)
    }
    await enrol(studentId, pplId)
    await enrol(studentId, rtId)
    await enrol(adminId, pplId)
  })

  afterAll(async () => {
    const { error } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .in('user_id', [adminId, studentId])
      .is('deleted_at', null)
    if (error) console.error('[my-courses afterAll] enrolment cleanup:', error.message)
    await cleanupTestData({ admin, orgId, userIds: [adminId, studentId] })
  })

  it('returns the student own courses ordered by sort_order', async () => {
    await signInAs(studentEmail, password)
    const result = await getMyCourses()
    expect(result.map((c) => c.code)).toEqual(['PPL_A', 'VFR_RT'])
  })

  it('returns only the admin own rows, not the org enrolments', async () => {
    await signInAs(adminEmail, password)
    const result = await getMyCourses()
    expect(result.map((c) => c.code)).toEqual(['PPL_A'])
  })
})
