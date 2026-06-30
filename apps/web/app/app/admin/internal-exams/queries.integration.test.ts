// App-layer integration tier (#925, #907) — listInternalExamCodes status splits + pagination.
//
// Exercises the real listInternalExamCodes helper against real local Postgres. The
// 'consumed' vs 'finished' split is on the embedded quiz_sessions.ended_at via a PostgREST
// !inner embed filter — a path mocked-client unit tests cannot execute — so it is verified
// here against the real schema. requireAdmin() reads the signed-in admin's org from the
// cookie jar (mocked in vitest.integration.setup.ts); the helper then reads via the
// service-role admin client scoped to that org.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  type ReferenceIds,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { listInternalExamCodes } from './queries'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let adminId: string
let studentId: string
const adminEmail = `int-iexam-codes-admin-${suffix}@test.local`
const studentEmail = `int-iexam-codes-stu-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
const ACTIVE_CODE_COUNT = 26 // > PAGE_SIZE (25) to exercise multi-page pagination
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const ISSUED_BASE = new Date('2026-01-01T00:00:00.000Z').getTime()

async function insertSession(endedAt: string | null): Promise<string> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: orgId,
      student_id: studentId,
      mode: 'internal_exam',
      ended_at: endedAt,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertSession: ${error.message}`)
  return data.id as string
}

describe('listInternalExamCodes (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-iexam-codes ${suffix}`, slug: `iec-${suffix}` })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    studentId = await createTestUser({
      admin,
      orgId,
      email: studentEmail,
      password,
      role: 'student',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `IEC_${suffix}`,
      subjectName: `Internal Exam Codes Subject ${suffix}`,
      topicCode: `IEC_${suffix}_T1`,
      topicName: `Internal Exam Codes Topic ${suffix}`,
    })

    // One consumed code whose session is still in flight (ended_at NULL) → 'consumed';
    // one whose session has ended → 'finished'.
    const inFlightSessionId = await insertSession(null)
    const finishedSessionId = await insertSession('2026-01-02T10:00:00.000Z')

    const codes: Record<string, unknown>[] = []
    for (let i = 0; i < ACTIVE_CODE_COUNT; i++) {
      codes.push({
        code: `IEC-${suffix}-A${i}`,
        subject_id: refs.subjectId,
        student_id: studentId,
        issued_by: adminId,
        issued_at: new Date(ISSUED_BASE + i * 60_000).toISOString(),
        expires_at: FUTURE,
        organization_id: orgId,
      })
    }
    codes.push({
      code: `IEC-${suffix}-CONSUMED`,
      subject_id: refs.subjectId,
      student_id: studentId,
      issued_by: adminId,
      issued_at: '2026-01-02T08:00:00.000Z',
      expires_at: FUTURE,
      consumed_at: '2026-01-02T09:00:00.000Z',
      consumed_session_id: inFlightSessionId,
      organization_id: orgId,
    })
    codes.push({
      code: `IEC-${suffix}-FINISHED`,
      subject_id: refs.subjectId,
      student_id: studentId,
      issued_by: adminId,
      issued_at: '2026-01-02T08:30:00.000Z',
      expires_at: FUTURE,
      consumed_at: '2026-01-02T09:30:00.000Z',
      consumed_session_id: finishedSessionId,
      organization_id: orgId,
    })

    const { error } = await admin.from('internal_exam_codes').insert(codes)
    if (error) throw new Error(`seed codes: ${error.message}`)
  })

  afterAll(async () => {
    const errors: string[] = []

    // internal_exam_codes FK-references quiz_sessions + users, so it must be removed BEFORE
    // cleanupTestData deletes those rows (it does not touch internal_exam_codes).
    try {
      const { error } = await admin
        .from('internal_exam_codes')
        .delete()
        .eq('organization_id', orgId)
        .select('id')
      if (error) throw new Error(error.message)
    } catch (e) {
      errors.push(`delete codes: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length === 0) {
      try {
        await cleanupTestData({ admin, orgId, userIds: [adminId, studentId] })
      } catch (e) {
        errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('counts only consumed codes whose session has ended for status=finished', async () => {
    await signInAs(adminEmail, password)

    const result = await listInternalExamCodes({ status: 'finished' })

    expect(result.totalCount).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.code).toBe(`IEC-${suffix}-FINISHED`)
    expect(result.rows[0]!.sessionEndedAt).not.toBeNull()
    // Verify the easa_subjects!subject_id FK-hint embed resolves the subject name from the
    // real schema. Without the hint, PostgREST may silently return null on FK ambiguity;
    // with it, resolution failure errors loudly AND success populates subjectName correctly.
    expect(result.rows[0]!.subjectName).toBe(`Internal Exam Codes Subject ${suffix}`)
  })

  it('counts only consumed codes whose session is in flight for status=consumed', async () => {
    await signInAs(adminEmail, password)

    const result = await listInternalExamCodes({ status: 'consumed' })

    expect(result.totalCount).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.code).toBe(`IEC-${suffix}-CONSUMED`)
    expect(result.rows[0]!.sessionEndedAt).toBeNull()
    expect(result.rows[0]!.subjectName).toBe(`Internal Exam Codes Subject ${suffix}`)
  })

  it('counts only unconsumed unexpired codes for status=active', async () => {
    await signInAs(adminEmail, password)

    const result = await listInternalExamCodes({ status: 'active' })

    expect(result.totalCount).toBe(ACTIVE_CODE_COUNT)
    expect(result.rows.every((r) => r.status === 'active')).toBe(true)
  })

  it('returns disjoint pages with a stable total when results exceed one page', async () => {
    await signInAs(adminEmail, password)

    const page1 = await listInternalExamCodes({ status: 'active', page: 1 })
    const page2 = await listInternalExamCodes({ status: 'active', page: 2 })

    expect(page1.totalCount).toBe(ACTIVE_CODE_COUNT)
    expect(page2.totalCount).toBe(ACTIVE_CODE_COUNT)
    expect(page1.rows).toHaveLength(25)
    expect(page2.rows).toHaveLength(ACTIVE_CODE_COUNT - 25)

    const page1Ids = new Set(page1.rows.map((r) => r.id))
    const overlap = page2.rows.filter((r) => page1Ids.has(r.id))
    expect(overlap).toHaveLength(0)
  })
})

describe('listInternalExamCodes — cross-org isolation', () => {
  // Self-contained: creates two separate orgs (A + B) and verifies that org A's admin
  // cannot see org B's codes. adminClient uses the service role but listInternalExamCodes
  // scopes every query to the signed-in admin's organizationId — this test locks that
  // invariant against regressions that remove or bypass the .eq('organization_id', ...) guard.
  let isoOrgAId: string
  let isoOrgBId: string
  let isoAdminAId: string
  let isoAdminBId: string
  let isoStudentAId: string
  let isoStudentBId: string
  let isoRefs: ReferenceIds
  let isoOrgBCodeId: string

  const isoAdminAEmail = `int-iexam-iso-adminA-${suffix}@test.local`
  const isoAdminBEmail = `int-iexam-iso-adminB-${suffix}@test.local`
  const isoStudentAEmail = `int-iexam-iso-stuA-${suffix}@test.local`
  const isoStudentBEmail = `int-iexam-iso-stuB-${suffix}@test.local`
  const isoPassword = 'test-pass-iso-123'
  const isoFuture = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  beforeAll(async () => {
    isoOrgAId = await createTestOrg({
      admin,
      name: `iso-iexam-orgA ${suffix}`,
      slug: `iso-oa-${suffix}`,
    })
    isoOrgBId = await createTestOrg({
      admin,
      name: `iso-iexam-orgB ${suffix}`,
      slug: `iso-ob-${suffix}`,
    })
    isoAdminAId = await createTestUser({
      admin,
      orgId: isoOrgAId,
      email: isoAdminAEmail,
      password: isoPassword,
      role: 'admin',
    })
    isoAdminBId = await createTestUser({
      admin,
      orgId: isoOrgBId,
      email: isoAdminBEmail,
      password: isoPassword,
      role: 'admin',
    })
    isoStudentAId = await createTestUser({
      admin,
      orgId: isoOrgAId,
      email: isoStudentAEmail,
      password: isoPassword,
      role: 'student',
    })
    isoStudentBId = await createTestUser({
      admin,
      orgId: isoOrgBId,
      email: isoStudentBEmail,
      password: isoPassword,
      role: 'student',
    })
    // One shared subject (easa_subjects is global, not org-scoped)
    isoRefs = await seedReferenceData({
      admin,
      subjectCode: `ISO_${suffix}`,
      subjectName: `Cross-Org Isolation Subject ${suffix}`,
      topicCode: `ISO_T_${suffix}`,
      topicName: `Cross-Org Isolation Topic ${suffix}`,
    })

    // One active code for org A (should be visible to org A's admin)
    const { error: errA } = await admin.from('internal_exam_codes').insert({
      code: `ISO-${suffix}-OA`,
      subject_id: isoRefs.subjectId,
      student_id: isoStudentAId,
      issued_by: isoAdminAId,
      issued_at: new Date().toISOString(),
      expires_at: isoFuture,
      organization_id: isoOrgAId,
    })
    if (errA) throw new Error(`seed orgA code: ${errA.message}`)

    // One active code for org B (must NOT appear in org A's admin's list)
    const { data: orgBCode, error: errB } = await admin
      .from('internal_exam_codes')
      .insert({
        code: `ISO-${suffix}-OB`,
        subject_id: isoRefs.subjectId,
        student_id: isoStudentBId,
        issued_by: isoAdminBId,
        issued_at: new Date().toISOString(),
        expires_at: isoFuture,
        organization_id: isoOrgBId,
      })
      .select('id')
      .single()
    if (errB) throw new Error(`seed orgB code: ${errB.message}`)
    isoOrgBCodeId = (orgBCode as { id: string }).id
  })

  afterAll(async () => {
    const errors: string[] = []

    try {
      const { error } = await admin
        .from('internal_exam_codes')
        .delete()
        .eq('organization_id', isoOrgAId)
        .select('id')
      if (error) throw new Error(error.message)
    } catch (e) {
      errors.push(`delete isoOrgA codes: ${e instanceof Error ? e.message : String(e)}`)
    }

    try {
      const { error } = await admin
        .from('internal_exam_codes')
        .delete()
        .eq('organization_id', isoOrgBId)
        .select('id')
      if (error) throw new Error(error.message)
    } catch (e) {
      errors.push(`delete isoOrgB codes: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length === 0) {
      try {
        await cleanupTestData({
          admin,
          orgId: isoOrgAId,
          userIds: [isoAdminAId, isoStudentAId],
        })
      } catch (e) {
        errors.push(`cleanupTestData isoOrgA: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length === 0) {
      try {
        await cleanupTestData({
          admin,
          orgId: isoOrgBId,
          userIds: [isoAdminBId, isoStudentBId],
        })
      } catch (e) {
        errors.push(`cleanupTestData isoOrgB: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [isoRefs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll cross-org: ${errors.join('; ')}`)
  })

  it("excludes another org's codes from an admin's list", async () => {
    await signInAs(isoAdminAEmail, isoPassword)

    const result = await listInternalExamCodes({})

    // Non-vacuous: org A's admin sees their own seeded code (proves the list is non-empty,
    // so the cross-org exclusion below is not vacuously true from an empty result set).
    expect(result.totalCount).toBe(1)
    expect(result.rows).toHaveLength(1)
    // Cross-org exclusion: the one visible row is org A's code, not org B's.
    expect(result.rows[0]!.id).not.toBe(isoOrgBCodeId)
  })
})
