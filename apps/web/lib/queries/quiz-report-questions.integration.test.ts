// App-layer integration tier (#925) — getQuizReportQuestions.
//
// Exercises the real getQuizReportQuestions helper (session ownership + completion
// guard, quiz_session_answers paginated SELECT, questions SELECT, get_report_correct_options
// RPC) against real Postgres under real RLS. Validates pagination, per-row shape,
// correct-option delivery, and RLS scoping across students.
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
import { getQuizReportQuestions } from '@/lib/queries/quiz-report-questions'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-qrq-a-${suffix}@test.local`
const emailB = `int-qrq-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let studentBClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

let sessionIdA: string
let sessionIdB: string

describe('getQuizReportQuestions (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-qrq ${suffix}`,
      slug: `int-qrq-${suffix}`,
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
      subjectCode: `QQ_${suffix}`,
      subjectName: `QRQ Subject ${suffix}`,
      topicCode: `QQ_${suffix}_T1`,
      topicName: `QRQ Topic ${suffix}`,
    })

    // 12 questions → spans two pages (PAGE_SIZE=10).
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 12,
    })
    questionIds = seeded.questionIds

    studentAClient = await getAuthenticatedClient({ email: emailA, password })
    studentBClient = await getAuthenticatedClient({ email: emailB, password })

    // Student A: 6 of 12 correct (first 6 'b', last 6 'a').
    const s = await seedCompletedSession({
      studentClient: studentAClient,
      questionIds,
      correctCount: 6,
      totalCount: 12,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    sessionIdA = s.sessionId

    // Student B: own completed session for RLS isolation.
    const sB = await seedCompletedSession({
      studentClient: studentBClient,
      questionIds,
      correctCount: 12,
      totalCount: 12,
    })
    sessionIdB = sB.sessionId
  })

  afterAll(async () => {
    const errors: string[] = []

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

  it('returns 10 questions on page 1 with totalCount 12', async () => {
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdA, page: 1 })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.totalCount).toBe(12)
    expect(r.questions).toHaveLength(10)
  })

  it('returns 2 questions on page 2', async () => {
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdA, page: 2 })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.questions).toHaveLength(2)
  })

  it('returns empty questions array for an out-of-range page', async () => {
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdA, page: 3 })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.questions).toHaveLength(0)
  })

  it('returns representative question shape with correct option and response time', async () => {
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdA, page: 1 })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    const q = r.questions[0]
    expect(q).toBeDefined()
    // seedQuestions sets correct_option_id='b'; get_report_correct_options delivers it post-session.
    expect(q?.correctOptionId).toBe('b')
    // Options are a/b/c/d (seedQuestions seeds exactly 4 options per question).
    expect(q?.options).toHaveLength(4)
    const optionIds = q?.options.map((o) => o.id).sort()
    expect(optionIds).toEqual(['a', 'b', 'c', 'd'])
    // response_time_ms is 2000 from seedCompletedSession.
    expect(q?.responseTimeMs).toBe(2000)
    // question_text is non-empty (seedQuestions generates "Test question N?").
    expect(typeof q?.questionText).toBe('string')
    expect(q?.questionText.length).toBeGreaterThan(0)
  })

  it('delivers exactly 6 correct answers across page 1 and page 2', async () => {
    // answered_at can tie at ms resolution → do NOT assert per-position correctness;
    // assert the aggregate across both pages.
    await signInAs(emailA, password)

    const r1 = await getQuizReportQuestions({ sessionId: sessionIdA, page: 1 })
    const r2 = await getQuizReportQuestions({ sessionId: sessionIdA, page: 2 })

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    if (!r1.ok || !r2.ok) throw new Error('page fetch failed')

    const allQuestions = [...r1.questions, ...r2.questions]
    const correctCount = allQuestions.filter((q) => q.isCorrect).length
    expect(correctCount).toBe(6)
  })

  it('returns ok:false for another students completed session', async () => {
    // Non-vacuous: B's session exists and is completed. If RLS leaks it, A would
    // see questions. ok:false proves student_id scoping.
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdB, page: 1 })

    expect(r.ok).toBe(false)
  })

  it('returns ok:true and questions for the authenticated students own session', async () => {
    // Paired positive assertion so the negative RLS check above is non-vacuous.
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdA, page: 1 })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.questions.length).toBeGreaterThan(0)
  })
})
