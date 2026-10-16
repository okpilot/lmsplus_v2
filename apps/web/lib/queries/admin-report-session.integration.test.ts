// App-layer integration tier (#925) — loadAdminReportSession.
//
// Exercises the real loader (org-scoped quiz_sessions read via the service-role client,
// quiz_session_answers count + paged scan) against real Postgres. adminClient bypasses RLS,
// so the loader's own organization_id / ended_at / deleted_at filters are the only guard.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedCompletedSession } from '@/lib/integration-support/fixtures'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { loadAdminReportSession } from '@/lib/queries/admin-report-session'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-ars-admin-${suffix}@test.local`
const studentEmail = `int-ars-student-${suffix}@test.local`
const otherAdminEmail = `int-ars-other-${suffix}@test.local`

// Sentinels: vitest runs afterAll after a failed beforeAll.
let orgId = ''
let otherOrgId = ''
let adminId = ''
let studentId = ''
let otherAdminId = ''
let refs: ReferenceIds | null = null
let questionIds: string[] = []

let endedSessionId: string
let orderedSessionId: string
let deletedSessionId: string
let activeSessionId: string

async function countAnswers(sessionId: string): Promise<number> {
  const { count, error } = await admin
    .from('quiz_session_answers')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  if (error) throw new Error(`countAnswers: ${error.message}`)
  return count ?? 0
}

async function readSession(sessionId: string) {
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('ended_at, deleted_at, organization_id')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`read session: ${error.message}`)
  return data
}

describe('loadAdminReportSession (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-ars ${suffix}`, slug: `int-ars-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `int-ars-other ${suffix}`,
      slug: `int-ars-other-${suffix}`,
    })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    studentId = await createTestUser({
      admin,
      orgId,
      email: studentEmail,
      password,
      role: 'student',
    })
    otherAdminId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: otherAdminEmail,
      password,
      role: 'admin',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `AS_${suffix}`,
      subjectName: `ARS Subject ${suffix}`,
      topicCode: `AS_${suffix}_T1`,
      topicName: `ARS Topic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds

    const studentClient = await getAuthenticatedClient({ email: studentEmail, password })
    const seedArgs = {
      studentClient,
      questionIds,
      correctCount: 2,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    }
    endedSessionId = (await seedCompletedSession(seedArgs)).sessionId
    deletedSessionId = (await seedCompletedSession(seedArgs)).sessionId
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedSessionId)
      .select('id')
    if (error || data?.length !== 1) throw new Error('soft-delete session failed')

    // Answers inserted in REVERSE answered_at order so insertion order cannot satisfy the sort.
    const { data: orderedStart, error: orderedError } = await studentClient.rpc(
      'start_quiz_session',
      {
        p_mode: 'quick_quiz',
        p_subject_id: refs.subjectId,
        p_topic_id: refs.topicId,
        p_question_ids: questionIds,
      },
    )
    if (orderedError || typeof orderedStart !== 'string') throw new Error('start ordered failed')
    orderedSessionId = orderedStart
    const base = Date.now()
    const { error: orderedInsertError } = await admin.from('quiz_session_answers').insert(
      questionIds.map((questionId, i) => ({
        session_id: orderedSessionId,
        question_id: questionId,
        selected_option_id: 'b',
        is_correct: true,
        response_time_ms: 1000,
        answered_at: new Date(base - i * 1000).toISOString(),
      })),
    )
    if (orderedInsertError) throw new Error(`insert ordered: ${orderedInsertError.message}`)
    const { data: endedRows, error: endError } = await admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', orderedSessionId)
      .select('id')
    if (endError || endedRows?.length !== 1) throw new Error('end ordered session failed')

    // Last: the single-active-session invariant allows one open session per student.
    const { data: started, error: startError } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: questionIds.slice(0, 1),
    })
    if (startError || typeof started !== 'string') throw new Error('start active session failed')
    activeSessionId = started
    const { error: answerError } = await admin.from('quiz_session_answers').insert({
      session_id: activeSessionId,
      question_id: questionIds[0],
      selected_option_id: 'b',
      is_correct: true,
      response_time_ms: 1000,
    })
    if (answerError) throw new Error(`insert active answer: ${answerError.message}`)
  })

  afterAll(async () => {
    const errors: string[] = []
    if (orgId) {
      try {
        await cleanupTestData({
          admin,
          orgId,
          userIds: [adminId, studentId].filter((id) => id.length > 0),
        })
      } catch (e) {
        errors.push(`cleanupTestData(orgId): ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (otherOrgId) {
      try {
        await cleanupTestData({
          admin,
          orgId: otherOrgId,
          userIds: [otherAdminId].filter((id) => id.length > 0),
        })
      } catch (e) {
        errors.push(`cleanupTestData(otherOrgId): ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // FK-ordering gate: reference data parents the questions cleanupTestData removes.
    if (refs && errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns the session row and its answer rows for an admin of the same organization', async () => {
    await signInAs(adminEmail, password)

    const r = await loadAdminReportSession(endedSessionId)

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('expected ok')
    expect(r.session.id).toBe(endedSessionId)
    expect(r.session.student_id).toBe(studentId)
    expect(r.session.total_questions).toBe(3)
    expect(r.session.correct_count).toBe(2)
    expect(r.answerRows.map((a) => a.question_id).sort()).toEqual([...questionIds].sort())
  })

  it('returns answer rows in answered_at order, not insertion order', async () => {
    // MUTATION: emptying orderColumns in loadAdminReportSession turns this red.
    await signInAs(adminEmail, password)

    const r = await loadAdminReportSession(orderedSessionId)

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('expected ok')
    expect(r.answerRows.map((a) => a.question_id)).toEqual([...questionIds].reverse())
  })

  it('serves nothing to an admin of a different organization', async () => {
    // MUTATION: removing .eq('organization_id', organizationId) from fetchAdminSessionForReport turns this red.
    // Non-vacuous: the session is ended, in the first org, and holds answer rows.
    const row = await readSession(endedSessionId)
    expect(row.ended_at).not.toBeNull()
    expect(row.deleted_at).toBeNull()
    expect(row.organization_id).toBe(orgId)
    expect(await countAnswers(endedSessionId)).toBeGreaterThan(0)

    await signInAs(otherAdminEmail, password)
    const r = await loadAdminReportSession(endedSessionId)

    expect(r.ok).toBe(false)
  })

  it('serves no session or answer rows while the session is still active', async () => {
    const row = await readSession(activeSessionId)
    expect(row.ended_at).toBeNull()
    expect(row.deleted_at).toBeNull()
    expect(row.organization_id).toBe(orgId)
    expect(await countAnswers(activeSessionId)).toBe(1)

    await signInAs(adminEmail, password)
    const r = await loadAdminReportSession(activeSessionId)

    expect(r.ok).toBe(false)
    expect('answerRows' in r).toBe(false)
  })

  it('does not serve a soft-deleted session', async () => {
    const row = await readSession(deletedSessionId)
    expect(row.ended_at).not.toBeNull()
    expect(row.deleted_at).not.toBeNull()
    expect(row.organization_id).toBe(orgId)

    await signInAs(adminEmail, password)
    const r = await loadAdminReportSession(deletedSessionId)

    expect(r.ok).toBe(false)
  })
})
