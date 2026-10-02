// App-layer integration tier (#925) — GDPR export of quiz_session_progress against real Postgres.
// The table is column-GRANT/RLS gated (SELECT own rows only), so the mocked unit tests cannot see
// whether the export's read actually returns rows for the student or leaks another student's.
import { createServerSupabaseClient } from '@repo/db/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { collectUserData } from './collect-user-data'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const emailA = `int-gdpr-prog-a-${suffix}@test.local`
const emailB = `int-gdpr-prog-b-${suffix}@test.local`

let orgId: string | undefined
let adminId: string | undefined
let studentAId: string
let studentBId: string
let refs: ReferenceIds | undefined
let questionId: string

async function seedProgress(studentId: string, timeSpentMs: number) {
  const { data: session, error: sErr } = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: orgId as string,
      student_id: studentId,
      mode: 'quick_quiz',
      config: { question_ids: [questionId] },
      total_questions: 1,
    })
    .select('id')
    .single()
  if (sErr || !session) throw new Error(`seed session: ${sErr?.message}`)
  const { error } = await admin.from('quiz_session_progress').insert({
    session_id: session.id,
    question_id: questionId,
    student_id: studentId,
    answer: { selected_option_id: 'a' },
    time_spent_ms: timeSpentMs,
    answered_at: new Date().toISOString(),
  })
  if (error) throw new Error(`seed progress: ${error.message}`)
  return session.id
}

describe('collectUserData quiz progress (app-layer integration)', () => {
  let sessionA: string
  let sessionB: string

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `gdpr prog ${suffix}`, slug: `gdpr-prog-${suffix}` })
    adminId = await createTestUser({
      admin,
      orgId,
      email: `adm-${emailA}`,
      password,
      role: 'admin',
    })
    studentAId = await createTestUser({ admin, orgId, email: emailA, password, role: 'student' })
    studentBId = await createTestUser({ admin, orgId, email: emailB, password, role: 'student' })
    const ref = await seedReferenceData({
      admin,
      subjectCode: `GP${suffix}`,
      subjectName: `GDPR Progress ${suffix}`,
      topicCode: `GP${suffix}-01`,
      topicName: `GDPR Topic ${suffix}`,
    })
    refs = ref
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminId,
      subjectId: ref.subjectId,
      topicId: ref.topicId,
      count: 1,
    })
    questionId = seeded.questionIds[0] as string
    sessionA = await seedProgress(studentAId, 1111)
    sessionB = await seedProgress(studentBId, 2222)
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      if (orgId) {
        const userIds = [adminId, studentAId, studentBId].filter(
          (id): id is string => id !== undefined,
        )
        await cleanupTestData({ admin, orgId, userIds })
      }
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      if (refs) await cleanupReferenceData({ admin, refs: [refs] })
    } catch (e) {
      errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it("exports the student's own progress through their RLS-scoped client and not another student's", async () => {
    const { data: all, error } = await admin
      .from('quiz_session_progress')
      .select('session_id')
      .in('student_id', [studentAId, studentBId])
    expect(error).toBeNull()
    expect(all?.map((r) => r.session_id).sort()).toEqual([sessionA, sessionB].sort())

    await signInAs(emailA, password)
    const payload = await collectUserData(await createServerSupabaseClient(), studentAId)

    expect(payload.warnings).toEqual([])
    expect(payload.quiz_progress).toHaveLength(1)
    expect(payload.quiz_progress[0]).toMatchObject({
      session_id: sessionA,
      question_id: questionId,
      answer: { selected_option_id: 'a' },
      time_spent_ms: 1111,
    })
  })

  it("exports the requested student's progress through the service-role client used by the admin export", async () => {
    const payload = await collectUserData(admin, studentBId)

    expect(payload.warnings).toEqual([])
    expect(payload.quiz_progress.map((r) => r.session_id)).toEqual([sessionB])
    expect(payload.quiz_progress[0]?.time_spent_ms).toBe(2222)
  })
})
