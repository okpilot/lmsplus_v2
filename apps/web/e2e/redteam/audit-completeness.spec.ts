/**
 * Red Team Spec: Audit Event Completeness — quiz/exam/internal-exam positive emission
 *
 * Asserts the 11 quiz/exam/internal-exam audit_events.event_type literals are written
 * by their triggering flows: quiz_session.batch_submitted, exam.started, exam.completed,
 * exam.expired, internal_exam.code_issued, internal_exam.code_voided,
 * internal_exam.started, internal_exam.completed, internal_exam.expired.
 *
 * The 5 auth-event tests (student.login + CT record_auth_event) live in
 * audit-auth-events.spec.ts.
 *
 * Scope: event_type + actor_id, plus the exam.completed metadata-key schema
 * (answered_count/correct_count, not the legacy answered/correct — #570).
 * Each test captures testStart BEFORE the trigger, filters created_at >= testStart
 * so parallel specs don't pollute counts. Backdating uses service-role
 * (exempt from quiz_sessions immutable-columns trigger, mig 20260502000001).
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import {
  backdateSession,
  buildAnswersForSession,
  expectAuditRow,
  expectCompletionMetadata,
  fetchActiveQuestionIds,
  issueCodeViaRpc,
} from './helpers/audit-helpers'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  ensureExamConfig,
  pickSubjectWithQuestions,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed'

/**
 * Assert the full within-time-limit `batch_submit_quiz` return contract (#818, §7).
 * The success path (mig 20260610000450) returns the grade fields but NO `expired`
 * key — only the past-grace path sets `expired: true` — so on a within-time submit
 * `expired` must be `undefined` (the submit was NOT flagged expired), and the
 * documented success payload must be present and well-typed.
 */
function expectWithinTimeSubmitContract(submitData: unknown, expectedAnswered: number): void {
  // Runtime-guard the cast (§5): the RPC returns a jsonb object — fail loudly if
  // the payload is null/array/primitive rather than silently asserting on undefined.
  if (submitData === null || typeof submitData !== 'object' || Array.isArray(submitData)) {
    throw new Error(
      `expected a batch_submit_quiz object payload, got: ${JSON.stringify(submitData)}`,
    )
  }
  const r = submitData as {
    expired?: boolean
    results?: unknown
    answered_count?: number
    correct_count?: number
    total_questions?: number
    passed?: boolean
    score_percentage?: number
  }
  expect(r.expired).toBeUndefined()
  expect(r.answered_count).toBe(expectedAnswered)
  expect(typeof r.correct_count).toBe('number')
  expect(typeof r.total_questions).toBe('number')
  expect(r.total_questions ?? 0).toBeGreaterThan(0)
  expect(typeof r.passed).toBe('boolean')
  expect(typeof r.score_percentage).toBe('number')
  expect(Array.isArray(r.results)).toBe(true)
}

test.describe('Red Team: Audit Event Completeness', () => {
  let admin: ReturnType<typeof getAdminClient>
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminAuthedClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let studentUserId: string
  let adminUserId: string
  let orgId: string
  let subjectId: string
  let topicId: string

  // Fixture tracker: sessions and codes cleaned up via afterEach.
  const tracker = createFixtureTracker()

  test.beforeAll(async () => {
    admin = getAdminClient()

    const seeded = await seedRedTeamUsers()
    studentUserId = seeded.attackerUserId
    orgId = seeded.orgId

    const seededAdmin = await seedRedTeamAdmin()
    adminUserId = seededAdmin.adminUserId

    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminAuthedClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)

    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    topicId = picked.topicId

    await ensureExamConfig(orgId, subjectId, topicId)
  })

  test.afterEach(async () => {
    // Service-role soft-delete (bypasses RLS + immutable-columns trigger,
    // deleted_at is in the mutable-columns whitelist).
    // try/finally ensures the ID set is cleared even if the soft-delete
    // throws. The error accumulator ensures BOTH cleanup blocks run even
    // when the first throws — otherwise the second block (codes) is
    // skipped on a session-cleanup failure, leaving codes uncleaned and
    // polluting downstream specs (code-style.md §7 hermiticity).
    await cleanupFixtures(admin, tracker)
  })

  test('writes quiz_session.batch_submitted on quick_quiz batch submit', async () => {
    const testStart = new Date().toISOString()

    const questionIds = await fetchActiveQuestionIds(admin, { orgId, subjectId, topicId, limit: 1 })
    const { data: sessionId, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })
    expect(startErr).toBeNull()
    // Explicit guard over a bare `as string` cast — narrows sessionId for both the
    // cleanup-set add and the answer build, and fails loudly with a diagnostic if
    // the RPC ever returns a non-string. (#636)
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error(`start_quiz_session returned non-string sessionId: ${typeof sessionId}`)
    }
    tracker.sessions.add(sessionId)

    const answers = await buildAnswersForSession(admin, sessionId)
    const { error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()

    await expectAuditRow(admin, 'quiz_session.batch_submitted', studentUserId, testStart, sessionId)
  })

  test('writes exam.started when start_exam_session runs', async () => {
    const testStart = new Date().toISOString()

    const { data, error } = await studentClient.rpc('start_exam_session', {
      p_subject_id: subjectId,
    })
    expect(error).toBeNull()
    const sessionId = (data as { session_id?: string } | null)?.session_id
    expect(sessionId).toBeTruthy()
    if (sessionId) tracker.sessions.add(sessionId)

    await expectAuditRow(admin, 'exam.started', studentUserId, testStart, sessionId)
  })

  test('writes exam.completed on mock_exam batch submit within time limit', async () => {
    const testStart = new Date().toISOString()

    const { data: startData, error: startErr } = await studentClient.rpc('start_exam_session', {
      p_subject_id: subjectId,
    })
    expect(startErr).toBeNull()
    const sessionId = (startData as { session_id?: string } | null)?.session_id
    expect(sessionId).toBeTruthy()
    if (!sessionId) throw new Error('no sessionId')
    tracker.sessions.add(sessionId)

    const answers = await buildAnswersForSession(admin, sessionId)
    const { data: submitData, error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()
    expectWithinTimeSubmitContract(submitData, answers.length)

    await expectAuditRow(admin, 'exam.completed', studentUserId, testStart, sessionId)
    await expectCompletionMetadata(admin, {
      eventType: 'exam.completed',
      actorId: studentUserId,
      testStart,
      sessionId,
    })
  })

  // #728: complete_empty_exam_session is a SEPARATE exam.completed emitter from
  // batch_submit_quiz. Lock its metadata schema so a future CREATE OR REPLACE
  // can't silently revert the *_count keys or drop the reason key.
  test('writes exam.completed with locked metadata on complete_empty_exam_session within grace', async () => {
    const testStart = new Date().toISOString()

    const { data: startData, error: startErr } = await studentClient.rpc('start_exam_session', {
      p_subject_id: subjectId,
    })
    expect(startErr).toBeNull()
    const sessionId = (startData as { session_id?: string } | null)?.session_id
    expect(sessionId).toBeTruthy()
    if (!sessionId) throw new Error('no sessionId')
    tracker.sessions.add(sessionId)

    // Within the grace window (just started) → completes as exam.completed.
    const { error: completeErr } = await studentClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })
    expect(completeErr).toBeNull()

    await expectAuditRow(admin, 'exam.completed', studentUserId, testStart, sessionId)
    await expectCompletionMetadata(admin, {
      eventType: 'exam.completed',
      actorId: studentUserId,
      testStart,
      sessionId,
    })

    // Lock the complete_empty-specific metadata (zero counts + reason). Use
    // maybeSingle (not single) so a missing row fails on the value assertion,
    // not a confusing PGRST116, matching the file's helper pattern.
    const { data: row, error: metaErr } = await admin
      .from('audit_events')
      .select('metadata')
      .eq('event_type', 'exam.completed')
      .eq('actor_id', studentUserId)
      .eq('resource_id', sessionId)
      .gte('created_at', testStart)
      .maybeSingle()
    expect(metaErr).toBeNull()
    const meta = (row?.metadata ?? {}) as Record<string, unknown>
    expect(meta.reason).toBe('completed with no answers')
    expect(meta.answered_count).toBe(0)
    expect(meta.correct_count).toBe(0)
  })

  // #728 (overdue branch): complete_empty on a past-grace session emits the
  // symmetric exam.expired event with reason 'timed out with no answers'.
  test('writes exam.expired with locked metadata on complete_empty_exam_session when overdue', async () => {
    const testStart = new Date().toISOString()

    const { data: startData, error: startErr } = await studentClient.rpc('start_exam_session', {
      p_subject_id: subjectId,
    })
    expect(startErr).toBeNull()
    const sessionId = (startData as { session_id?: string } | null)?.session_id
    expect(sessionId).toBeTruthy()
    if (!sessionId) throw new Error('no sessionId')
    tracker.sessions.add(sessionId)

    await backdateSession(admin, sessionId)

    const { error: completeErr } = await studentClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })
    expect(completeErr).toBeNull()

    await expectAuditRow(admin, 'exam.expired', studentUserId, testStart, sessionId)
    await expectCompletionMetadata(admin, {
      eventType: 'exam.expired',
      actorId: studentUserId,
      testStart,
      sessionId,
    })

    const { data: row, error: metaErr } = await admin
      .from('audit_events')
      .select('metadata')
      .eq('event_type', 'exam.expired')
      .eq('actor_id', studentUserId)
      .eq('resource_id', sessionId)
      .gte('created_at', testStart)
      .maybeSingle()
    expect(metaErr).toBeNull()
    expect((row?.metadata as Record<string, unknown>)?.reason).toBe('timed out with no answers')
  })

  test('writes exam.expired when mock_exam session is past the grace period', async () => {
    const testStart = new Date().toISOString()

    const { data: startData, error: startErr } = await studentClient.rpc('start_exam_session', {
      p_subject_id: subjectId,
    })
    expect(startErr).toBeNull()
    const sessionId = (startData as { session_id?: string } | null)?.session_id
    expect(sessionId).toBeTruthy()
    if (!sessionId) throw new Error('no sessionId')
    tracker.sessions.add(sessionId)

    await backdateSession(admin, sessionId)

    const answers = await buildAnswersForSession(admin, sessionId)
    const { data: submitData, error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()
    expect((submitData as { expired?: boolean } | null)?.expired).toBe(true)

    await expectAuditRow(admin, 'exam.expired', studentUserId, testStart, sessionId)
  })

  test('writes internal_exam.code_issued when admin issues a code (actor=admin)', async () => {
    const testStart = new Date().toISOString()

    const { codeId } = await issueCodeViaRpc(
      adminAuthedClient,
      subjectId,
      studentUserId,
      tracker.codes,
    )

    await expectAuditRow(admin, 'internal_exam.code_issued', adminUserId, testStart, codeId)
  })

  test('writes internal_exam.code_voided when admin voids a code (actor=admin)', async () => {
    const testStart = new Date().toISOString()

    const { codeId } = await issueCodeViaRpc(
      adminAuthedClient,
      subjectId,
      studentUserId,
      tracker.codes,
    )
    const { error: voidErr } = await adminAuthedClient.rpc('void_internal_exam_code', {
      p_code_id: codeId,
      p_reason: 'audit-completeness red-team test',
    })
    expect(voidErr).toBeNull()

    await expectAuditRow(admin, 'internal_exam.code_voided', adminUserId, testStart, codeId)
  })

  test('writes internal_exam.started when student redeems a valid code', async () => {
    const testStart = new Date().toISOString()

    const { code } = await issueCodeViaRpc(
      adminAuthedClient,
      subjectId,
      studentUserId,
      tracker.codes,
    )
    const { data, error } = await studentClient.rpc('start_internal_exam_session', {
      p_code: code,
    })
    expect(error).toBeNull()
    type StartedRow = { session_id: string }
    const row = (data as StartedRow[] | null)?.[0]
    if (!row?.session_id) {
      throw new Error('start_internal_exam_session returned no session_id')
    }
    tracker.sessions.add(row.session_id)

    await expectAuditRow(admin, 'internal_exam.started', studentUserId, testStart, row.session_id)
  })

  test('writes internal_exam.completed when internal_exam batch submits within time limit', async () => {
    const testStart = new Date().toISOString()

    const { code } = await issueCodeViaRpc(
      adminAuthedClient,
      subjectId,
      studentUserId,
      tracker.codes,
    )
    const { data: startData, error: startErr } = await studentClient.rpc(
      'start_internal_exam_session',
      { p_code: code },
    )
    expect(startErr).toBeNull()
    type StartedRow = { session_id: string }
    const sessionId = (startData as StartedRow[] | null)?.[0]?.session_id
    expect(sessionId).toBeTruthy()
    if (!sessionId) throw new Error('no sessionId')
    tracker.sessions.add(sessionId)

    const answers = await buildAnswersForSession(admin, sessionId)
    const { data: submitData, error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()
    expectWithinTimeSubmitContract(submitData, answers.length)

    await expectAuditRow(admin, 'internal_exam.completed', studentUserId, testStart, sessionId)
    await expectCompletionMetadata(admin, {
      eventType: 'internal_exam.completed',
      actorId: studentUserId,
      testStart,
      sessionId,
    })
  })

  test('writes internal_exam.expired when internal_exam session is past the grace period', async () => {
    const testStart = new Date().toISOString()

    const { code } = await issueCodeViaRpc(
      adminAuthedClient,
      subjectId,
      studentUserId,
      tracker.codes,
    )
    const { data: startData, error: startErr } = await studentClient.rpc(
      'start_internal_exam_session',
      { p_code: code },
    )
    expect(startErr).toBeNull()
    type StartedRow = { session_id: string }
    const sessionId = (startData as StartedRow[] | null)?.[0]?.session_id
    expect(sessionId).toBeTruthy()
    if (!sessionId) throw new Error('no sessionId')
    tracker.sessions.add(sessionId)

    await backdateSession(admin, sessionId)

    const answers = await buildAnswersForSession(admin, sessionId)
    const { data: submitData, error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()
    expect((submitData as { expired?: boolean } | null)?.expired).toBe(true)

    await expectAuditRow(admin, 'internal_exam.expired', studentUserId, testStart, sessionId)
  })
})
