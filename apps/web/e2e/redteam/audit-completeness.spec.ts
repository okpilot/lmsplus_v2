/**
 * Red Team Spec: Audit Event Completeness — quiz/exam/internal-exam positive emission
 *
 * Asserts the 10 quiz/exam/internal-exam audit_events.event_type literals are written
 * by their triggering flows: quiz_session.batch_submitted, exam.started, exam.completed,
 * exam.expired, internal_exam.code_issued, internal_exam.code_voided,
 * internal_exam.code_emailed, internal_exam.started, internal_exam.completed,
 * internal_exam.expired.
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
  expectAuditRow,
  expectCompletionMetadata,
  fetchActiveQuestionIds,
  issueCodeViaRpc,
  readAuditReason,
} from './helpers/audit-helpers'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import {
  buildMcProgressAnswers,
  finishSeedSession,
  saveAndFinish,
  saveSeedAnswers,
} from './helpers/finish-session'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

/**
 * Assert the full within-time-limit `finish_quiz_session` return contract (#818, §7).
 * The success path (mig 20261004000300) returns the grade fields but NO `expired`
 * key — only the past-grace path sets `expired: true` — so on a within-time submit
 * `expired` must be `undefined` (the submit was NOT flagged expired), and the
 * documented success payload must be present and well-typed.
 */
function expectWithinTimeSubmitContract(submitData: unknown, expectedAnswered: number): void {
  // Runtime-guard the cast (§5): the RPC returns a jsonb object — fail loudly if
  // the payload is null/array/primitive rather than silently asserting on undefined.
  if (submitData === null || typeof submitData !== 'object' || Array.isArray(submitData)) {
    throw new Error(
      `expected a finish_quiz_session object payload, got: ${JSON.stringify(submitData)}`,
    )
  }
  const r = submitData as {
    expired?: boolean
    results?: unknown[]
    answered_count?: number
    correct_count?: number
    total_questions?: number
    passed?: boolean
    score_percentage?: number
  }
  expect(r.expired).toBeUndefined()
  expect(r.answered_count).toBe(expectedAnswered)
  expect(typeof r.correct_count).toBe('number')
  // Bounds (§7): correct answers can't be negative or exceed the count submitted.
  expect(r.correct_count ?? -1).toBeGreaterThanOrEqual(0)
  expect(r.correct_count ?? Infinity).toBeLessThanOrEqual(expectedAnswered)
  expect(typeof r.total_questions).toBe('number')
  expect(r.total_questions ?? 0).toBeGreaterThan(0)
  expect(typeof r.passed).toBe('boolean')
  expect(typeof r.score_percentage).toBe('number')
  // Bounds (§7): a percentage is in [0, 100].
  expect(r.score_percentage ?? -1).toBeGreaterThanOrEqual(0)
  expect(r.score_percentage ?? Infinity).toBeLessThanOrEqual(100)
  // results is the per-question payload array — one entry per submitted answer.
  // Assert length (not just Array.isArray, which passes on an emptied []).
  expect(Array.isArray(r.results)).toBe(true)
  expect(r.results?.length).toBe(expectedAnswered)
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

  // Set by the login-instructions test before its RPC call; afterEach resets on it (§7).
  let loginInstructionsStamped = false

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

  // Two independent steps, isolated so one failing never skips the other (§7).
  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await cleanupFixtures(admin, tracker)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (loginInstructionsStamped) {
      try {
        const { data, error } = await admin
          .from('users')
          .update({ login_instructions_sent_at: null, temp_password_expires_at: null })
          .eq('id', studentUserId)
          .select('id')
        if (error) throw new Error(`reset login-instructions columns: ${error.message}`)
        if ((data?.length ?? 0) > 0)
          console.log(`[cleanup] reset login-instructions columns for ${data.length} user(s)`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        loginInstructionsStamped = false
      }
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('writes quiz_session.batch_submitted on quick_quiz finish', async () => {
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

    const answers = await buildMcProgressAnswers(admin, sessionId)
    const { error: finishErr } = await saveAndFinish(studentClient, sessionId, answers)
    expect(finishErr).toBeNull()

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

  test('writes exam.completed on mock_exam finish within time limit', async () => {
    const testStart = new Date().toISOString()

    const { data: startData, error: startErr } = await studentClient.rpc('start_exam_session', {
      p_subject_id: subjectId,
    })
    expect(startErr).toBeNull()
    const sessionId = (startData as { session_id?: string } | null)?.session_id
    expect(sessionId).toBeTruthy()
    if (!sessionId) throw new Error('no sessionId')
    tracker.sessions.add(sessionId)

    const answers = await buildMcProgressAnswers(admin, sessionId)
    const finish = await saveAndFinish(studentClient, sessionId, answers)
    expect(finish.error).toBeNull()
    expectWithinTimeSubmitContract(finish.data, answers.length)

    await expectAuditRow(admin, 'exam.completed', studentUserId, testStart, sessionId)
    await expectCompletionMetadata(admin, {
      eventType: 'exam.completed',
      actorId: studentUserId,
      testStart,
      sessionId,
    })
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

    // Save BEFORE backdating: save_quiz_answer refuses a session past its grace period.
    await saveSeedAnswers(studentClient, sessionId, await buildMcProgressAnswers(admin, sessionId))
    await backdateSession(admin, sessionId)

    const finish = await finishSeedSession(studentClient, sessionId)
    expect(finish.error).toBeNull()
    expect((finish.data as { expired?: boolean } | null)?.expired).toBe(true)

    await expectAuditRow(admin, 'exam.expired', studentUserId, testStart, sessionId)
    expect(await readAuditReason(admin, 'exam.expired', sessionId)).toBe(
      'submission past grace period',
    )
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

  test('writes internal_exam.code_emailed when admin emails a code (actor=admin)', async () => {
    const testStart = new Date().toISOString()

    const { codeId } = await issueCodeViaRpc(
      adminAuthedClient,
      subjectId,
      studentUserId,
      tracker.codes,
    )
    const { data: emailData, error: emailErr } = await adminAuthedClient.rpc(
      'record_internal_exam_code_emailed',
      { p_code_id: codeId },
    )
    expect(emailErr).toBeNull()
    // record_internal_exam_code_emailed RETURNS void — the documented success
    // payload is null (code-style.md §7 RPC output contract).
    expect(emailData).toBeNull()

    await expectAuditRow(admin, 'internal_exam.code_emailed', adminUserId, testStart, codeId)
  })

  test('writes user.login_instructions_sent when admin sends login instructions (actor=admin)', async () => {
    const testStart = new Date().toISOString()
    loginInstructionsStamped = true // set before the call: afterEach resets on it (§7)
    const { data: sendData, error: sendErr } = await adminAuthedClient.rpc(
      'record_login_instructions_sent',
      { p_user_id: studentUserId },
    )
    expect(sendErr).toBeNull()
    // record_login_instructions_sent RETURNS void — the documented success
    // payload is null (code-style.md §7 RPC output contract).
    expect(sendData).toBeNull()

    await expectAuditRow(
      admin,
      'user.login_instructions_sent',
      adminUserId,
      testStart,
      studentUserId,
    )
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

  test('writes internal_exam.completed when internal_exam finishes within time limit', async () => {
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

    const answers = await buildMcProgressAnswers(admin, sessionId)
    const finish = await saveAndFinish(studentClient, sessionId, answers)
    expect(finish.error).toBeNull()
    expectWithinTimeSubmitContract(finish.data, answers.length)

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

    // Save BEFORE backdating: save_quiz_answer refuses a session past its grace period.
    await saveSeedAnswers(studentClient, sessionId, await buildMcProgressAnswers(admin, sessionId))
    await backdateSession(admin, sessionId)

    const finish = await finishSeedSession(studentClient, sessionId)
    expect(finish.error).toBeNull()
    expect((finish.data as { expired?: boolean } | null)?.expired).toBe(true)

    await expectAuditRow(admin, 'internal_exam.expired', studentUserId, testStart, sessionId)
    expect(await readAuditReason(admin, 'internal_exam.expired', sessionId)).toBe(
      'submission past grace period',
    )
  })
})
