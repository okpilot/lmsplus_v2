// App-layer integration tier (#925) — getQuizReportSummary.
//
// Exercises the real getQuizReportSummary helper against real Postgres under
// real RLS. Validates the completion guard (open session → null), the full
// field mapping from a completed session, and RLS scoping across students.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedCompletedSession } from '@/lib/integration-support/fixtures'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { getQuizReportSummary } from '@/lib/queries/quiz-report'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-qrep-a-${suffix}@test.local`
const emailB = `int-qrep-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let studentBClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

// Completed session IDs captured for use in tests.
let sessionIdA: string
let sessionIdB: string
// Open (not yet completed) session ID for the completion guard test.
let openSessionId: string
// DB-returned scorePercentage for A's completed session.
let scorePercentageA: number

describe('getQuizReportSummary (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-qrep ${suffix}`,
      slug: `int-qrep-${suffix}`,
    })

    studentAId = await createTestUser({
      admin,
      orgId,
      email: emailA,
      password,
      role: 'student',
    })

    studentBId = await createTestUser({
      admin,
      orgId,
      email: emailB,
      password,
      role: 'student',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `QR_${suffix}`,
      subjectName: `Report Subject ${suffix}`,
      topicCode: `QR_${suffix}_T1`,
      topicName: `Report Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds

    studentAClient = await getAuthenticatedClient({ email: emailA, password })
    studentBClient = await getAuthenticatedClient({ email: emailB, password })

    // Student A: completed session — 2 of 3 correct.
    const s = await seedCompletedSession({
      studentClient: studentAClient,
      questionIds,
      correctCount: 2,
      totalCount: 3,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    sessionIdA = s.sessionId
    scorePercentageA = s.scorePercentage

    // Student B: completed session for RLS isolation test.
    const sB = await seedCompletedSession({
      studentClient: studentBClient,
      questionIds,
      correctCount: 3,
      totalCount: 3,
    })
    sessionIdB = sB.sessionId

    // Open session for the completion guard test.
    const { data: openId, error: openErr } = await studentAClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: questionIds.slice(0, 1),
    })
    if (openErr) throw new Error(`open session start: ${openErr.message}`)
    openSessionId = openId as string
  })

  afterAll(async () => {
    const errors: string[] = []

    // Force-complete the open session so cleanupTestData can delete the org
    // (FK from quiz_sessions to organizations — active sessions may block deletion).
    // Best-effort (the row is org-scoped and removed by cleanupTestData next), but
    // log the PostgREST error so a regression here isn't silent (code-style §5).
    const { error: forceCompleteErr } = await admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', openSessionId)
    if (forceCompleteErr) {
      console.error(
        '[quiz-report.integration afterAll] force-complete error:',
        forceCompleteErr.message,
      )
    }

    try {
      await cleanupTestData({ admin, orgId, userIds: [studentAId, studentBId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
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

  it('returns summary with correct field mapping for a completed session', async () => {
    await signInAs(emailA, password)

    const summary = await getQuizReportSummary(sessionIdA)

    expect(summary).not.toBeNull()
    expect(summary?.sessionId).toBe(sessionIdA)
    expect(summary?.mode).toBe('quick_quiz')
    expect(summary?.subjectName).toBe(`Report Subject ${suffix}`)
    expect(summary?.totalQuestions).toBe(3)
    expect(summary?.answeredCount).toBe(3)
    expect(summary?.correctCount).toBe(2)
    expect(summary?.passed).toBeNull()
    expect(summary?.timeLimitSeconds).toBeNull()
    // Use toBeCloseTo with the DB-returned value to avoid JS rounding divergence.
    expect(summary?.scorePercentage).toBeCloseTo(scorePercentageA, 1)
  })

  it('returns null for an open (not yet completed) session', async () => {
    await signInAs(emailA, password)

    const summary = await getQuizReportSummary(openSessionId)

    expect(summary).toBeNull()
  })

  it('returns null for another students completed session', async () => {
    // Non-vacuous: B's session exists and is completed. If RLS over-scopes,
    // A would see it. Null proves the student_id scoping works.
    await signInAs(emailA, password)

    const summary = await getQuizReportSummary(sessionIdB)

    expect(summary).toBeNull()
  })

  it('returns non-null for the authenticated students own completed session', async () => {
    // Paired positive assertion so the null checks above are non-vacuous.
    await signInAs(emailA, password)

    const summary = await getQuizReportSummary(sessionIdA)

    expect(summary).not.toBeNull()
  })
})
