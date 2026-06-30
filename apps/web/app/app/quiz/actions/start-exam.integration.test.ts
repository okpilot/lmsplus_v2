// App-layer integration tier (#925) — startExamSession.
//
// Exercises the real startExamSession Server Action against real Postgres under
// real RLS. Validates: happy-path session shape, duplicate-session rejection,
// missing-config rejection, insufficient-questions rejection, Zod parse
// rejection, and unauthenticated rejection.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  clearActiveSessions,
  createTestOrg,
  createTestUser,
  getAdminClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { startExamSession } from './start-exam'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-exam-a-${suffix}@test.local`
const emailB = `int-exam-b-${suffix}@test.local`
const password = 'test-pass-123'

// Subject with a fully-configured exam (3 questions, config seeded).
let refsOk: ReferenceIds
let seededQuestionIds: string[]

// Subject with NO exam_configs row and NO questions.
let refsNoCfg: ReferenceIds

// Subject with a config requiring 5 questions but only 2 seeded.
let refsFew: ReferenceIds

describe('startExamSession (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-exam ${suffix}`,
      slug: `int-exam-${suffix}`,
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

    // --- refsOk: fully configured, 3 active questions ---
    refsOk = await seedReferenceData({
      admin,
      subjectCode: `EX_OK_${suffix}`,
      subjectName: `Exam OK Subject ${suffix}`,
      topicCode: `EX_OK_${suffix}_T1`,
      topicName: `Exam OK Topic ${suffix}`,
    })

    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refsOk.subjectId,
      topicId: refsOk.topicId,
      count: 3,
    })
    seededQuestionIds = seeded.questionIds

    const { data: configOk, error: configOkErr } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: refsOk.subjectId,
        enabled: true,
        total_questions: 3,
        time_limit_seconds: 3600,
        pass_mark: 50,
      })
      .select('id')
      .single()
    if (configOkErr) throw new Error(`exam_configs (ok) insert: ${configOkErr.message}`)

    const { error: distOkErr } = await admin.from('exam_config_distributions').insert({
      exam_config_id: configOk.id,
      topic_id: refsOk.topicId,
      subtopic_id: null,
      question_count: 3,
    })
    if (distOkErr) throw new Error(`exam_config_distributions (ok) insert: ${distOkErr.message}`)

    // --- refsNoCfg: no exam_configs row, no questions ---
    refsNoCfg = await seedReferenceData({
      admin,
      subjectCode: `EX_NC_${suffix}`,
      subjectName: `Exam NoCfg Subject ${suffix}`,
      topicCode: `EX_NC_${suffix}_T1`,
      topicName: `Exam NoCfg Topic ${suffix}`,
    })

    // --- refsFew: config requires 5 questions, only 2 seeded ---
    refsFew = await seedReferenceData({
      admin,
      subjectCode: `EX_FW_${suffix}`,
      subjectName: `Exam Few Subject ${suffix}`,
      topicCode: `EX_FW_${suffix}_T1`,
      topicName: `Exam Few Topic ${suffix}`,
    })

    await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refsFew.subjectId,
      topicId: refsFew.topicId,
      count: 2,
    })

    const { data: configFew, error: configFewErr } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: refsFew.subjectId,
        enabled: true,
        total_questions: 5,
        time_limit_seconds: 3600,
        pass_mark: 50,
      })
      .select('id')
      .single()
    if (configFewErr) throw new Error(`exam_configs (few) insert: ${configFewErr.message}`)

    const { error: distFewErr } = await admin.from('exam_config_distributions').insert({
      exam_config_id: configFew.id,
      topic_id: refsFew.topicId,
      subtopic_id: null,
      question_count: 5,
    })
    if (distFewErr) throw new Error(`exam_config_distributions (few) insert: ${distFewErr.message}`)
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
        await cleanupReferenceData({ admin, refs: [refsOk, refsNoCfg, refsFew] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  // startExamSession opens a mock_exam session it does NOT end, so a session left
  // active by one test would make the next test's start raise `another_session_active`
  // (single-active-session invariant, #1011) instead of reaching the config /
  // question-count guard under test. Clear both students' active sessions after each
  // test. Single cleanup step (code-style §7); afterEach runs even after a failure.
  afterEach(async () => {
    await clearActiveSessions({
      admin,
      studentIds: [studentAId, studentBId],
      label: 'startExamSession',
    })
  })

  it('starts a practice exam and returns the session shape', async () => {
    await signInAs(emailA, password)

    const result = await startExamSession({ subjectId: refsOk.subjectId })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(typeof result.sessionId).toBe('string')
    expect(result.sessionId).toBeTruthy()
    expect(result.questionIds).toHaveLength(3)
    expect(result.questionIds.sort()).toEqual([...seededQuestionIds].sort())
    expect(result.totalQuestions).toBe(3)
    expect(result.timeLimitSeconds).toBe(3600)
    expect(result.passMark).toBe(50)
    expect(typeof result.startedAt).toBe('string')
  })

  it('rejects a second concurrent practice exam for the same subject', async () => {
    // Student B opens a session and then tries to open another — self-contained,
    // independent of the session that test A left open.
    await signInAs(emailB, password)
    const first = await startExamSession({ subjectId: refsOk.subjectId })
    expect(first.success).toBe(true)

    // Student B's session persists in the cookie jar for the rest of this test —
    // no re-auth needed before the second attempt.
    const second = await startExamSession({ subjectId: refsOk.subjectId })

    expect(second.success).toBe(false)
    if (second.success) throw new Error('expected failure')
    expect(second.error).toBe('A Practice Exam is already in progress for this subject.')
  })

  it('rejects a subject with no exam configuration', async () => {
    await signInAs(emailA, password)

    const result = await startExamSession({ subjectId: refsNoCfg.subjectId })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Practice Exam is not configured for this subject.')
  })

  it('rejects when the subject has too few active questions', async () => {
    await signInAs(emailA, password)

    const result = await startExamSession({ subjectId: refsFew.subjectId })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not enough questions available to start this Practice Exam.')
  })

  it('rejects malformed input', async () => {
    await signInAs(emailA, password)

    const result = await startExamSession({})

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Invalid input')
  })

  it('rejects an unauthenticated caller', async () => {
    // No signInAs — the cookie jar is empty after the per-test reset.
    const result = await startExamSession({ subjectId: refsOk.subjectId })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not authenticated')
  })
})
