/**
 * Red Team Spec: Audit Event Completeness (positive coverage for issue #108).
 *
 * Asserts the 8 currently-untested audit_events.event_type literals are written
 * by their triggering flows: quiz_session.batch_submitted, exam.started/.completed/.expired,
 * internal_exam.started/.code_issued/.code_voided/.expired. Negative gates
 * (forgery, tamper, delete) live in audit-event-forgery.spec.ts.
 *
 * Scope: event_type + actor_id, plus the exam.completed metadata-key schema
 * (answered_count/correct_count, not the legacy answered/correct — #570).
 * Each test captures testStart BEFORE the trigger, filters created_at >= testStart
 * so parallel specs don't pollute counts. Backdating uses service-role
 * (exempt from quiz_sessions immutable-columns trigger, mig 20260502000001).
 */

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
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

test.describe('Red Team: Audit Event Completeness', () => {
  let admin: ReturnType<typeof getAdminClient>
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminAuthedClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let studentUserId: string
  let victimUserId: string
  let adminUserId: string
  let orgId: string
  let subjectId: string
  let topicId: string

  // Track sessions and codes created during tests so afterEach can clean up
  // via service-role soft-delete for both (deleted_at is in the mutable-
  // columns whitelist; both tables retain row history for audit purposes).
  const createdSessionIds = new Set<string>()
  const createdCodeIds = new Set<string>()

  // Track users this spec soft-deletes (only the user.deactivated CT target) so
  // afterEach can restore deleted_at = null. The audit_events rows it produces are
  // NOT cleaned (append-only) — testStart scoping isolates them instead.
  const softDeletedUserIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()

    const seeded = await seedRedTeamUsers()
    studentUserId = seeded.attackerUserId
    victimUserId = seeded.victimUserId
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
    const errors: string[] = []
    const now = new Date().toISOString()
    if (createdSessionIds.size > 0) {
      try {
        const { data, error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: now })
          .in('id', Array.from(createdSessionIds))
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`afterEach soft-delete sessions: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[audit-completeness] soft-deleted ${data?.length} quiz_session(s)`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        createdSessionIds.clear()
      }
    }
    if (createdCodeIds.size > 0) {
      try {
        const { data, error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: now })
          .in('id', Array.from(createdCodeIds))
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`afterEach soft-delete codes: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[audit-completeness] soft-deleted ${data?.length} internal_exam_code(s)`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        createdCodeIds.clear()
      }
    }
    if (softDeletedUserIds.size > 0) {
      try {
        const { data, error } = await admin
          .from('users')
          .update({ deleted_at: null })
          .in('id', Array.from(softDeletedUserIds))
          .not('deleted_at', 'is', null)
          .select('id')
        if (error) throw new Error(`afterEach restore users: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[audit-completeness] restored ${data?.length} soft-deleted user(s)`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        softDeletedUserIds.clear()
      }
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  async function fetchActiveQuestionIds(limit: number): Promise<string[]> {
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectId)
      .eq('topic_id', topicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(limit)
    if (error) throw new Error(`fetchActiveQuestionIds: ${error.message}`)
    if (!data || data.length < limit) {
      throw new Error(`fetchActiveQuestionIds: needed ${limit} questions, got ${data?.length ?? 0}`)
    }
    return data.map((row) => row.id)
  }

  async function buildAnswersForSession(sessionId: string): Promise<unknown[]> {
    const { data: session, error: sErr } = await admin
      .from('quiz_sessions')
      .select('config')
      .eq('id', sessionId)
      .single()
    if (sErr || !session) throw new Error(`buildAnswers session: ${sErr?.message}`)
    const rawIds = (session.config as { question_ids?: unknown })?.question_ids
    if (!Array.isArray(rawIds)) {
      throw new Error(
        `buildAnswers: config.question_ids is not an array: ${JSON.stringify(rawIds)}`,
      )
    }
    const ids = rawIds.filter((v): v is string => typeof v === 'string')
    if (ids.length === 0) throw new Error('buildAnswers: session has no question_ids')

    // Service role can read full questions including options for grading shape.
    const { data: questions, error: qErr } = await admin
      .from('questions')
      .select('id, options')
      .in('id', ids)
    if (qErr || !questions) throw new Error(`buildAnswers questions: ${qErr?.message}`)
    if (!Array.isArray(questions)) {
      throw new Error(`buildAnswers: unexpected questions shape: ${JSON.stringify(questions)}`)
    }
    return questions.map((raw) => {
      const q = raw as unknown as { id: unknown; options: unknown }
      if (typeof q.id !== 'string') {
        throw new Error(`buildAnswers: unexpected question id shape: ${JSON.stringify(q.id)}`)
      }
      if (!Array.isArray(q.options)) {
        throw new Error(`buildAnswers: question ${q.id} options is not an array`)
      }
      const firstOpt = q.options[0] as { id?: unknown } | undefined
      const optionId = typeof firstOpt?.id === 'string' ? firstOpt.id : undefined
      if (!optionId) {
        throw new Error(`buildAnswers: question ${q.id} has no options`)
      }
      return {
        question_id: q.id,
        selected_option: optionId,
        response_time_ms: 1500,
      }
    })
  }

  async function expectAuditRow(
    eventType: string,
    actorId: string,
    testStart: string,
    resourceId?: string,
  ) {
    let q = admin
      .from('audit_events')
      .select('id, event_type, actor_id, resource_id, created_at')
      .eq('event_type', eventType)
      .eq('actor_id', actorId)
      .gte('created_at', testStart)
    if (resourceId) q = q.eq('resource_id', resourceId)
    const { data, error } = await q
    expect(error, `audit_events query error for ${eventType}`).toBeNull()
    const where = resourceId ? ` resource ${resourceId}` : ''
    expect(
      data?.length ?? 0,
      `expected at least one ${eventType} audit row for actor ${actorId}${where}`,
    ).toBeGreaterThan(0)
  }

  // #570: batch_submit_quiz writes ONE shared metadata object for both its
  // completion event_types (exam.completed / internal_exam.completed). Locks
  // the canonical *_count key schema so a future CREATE OR REPLACE can't
  // silently revert either branch to the bare 'answered'/'correct' keys.
  async function expectCompletionMetadata(opts: {
    eventType: string
    actorId: string
    testStart: string
    sessionId: string
  }) {
    const { eventType, actorId, testStart, sessionId } = opts
    const { data, error } = await admin
      .from('audit_events')
      .select('metadata')
      .eq('event_type', eventType)
      .eq('actor_id', actorId)
      .eq('resource_id', sessionId)
      .gte('created_at', testStart)
    expect(error, `${eventType} metadata query error`).toBeNull()
    const meta = (data?.[0]?.metadata ?? {}) as Record<string, unknown>
    expect(meta, `${eventType} metadata should expose answered_count`).toHaveProperty(
      'answered_count',
    )
    expect(meta, `${eventType} metadata should expose correct_count`).toHaveProperty(
      'correct_count',
    )
    expect(meta, `${eventType} metadata must not use the legacy 'answered' key`).not.toHaveProperty(
      'answered',
    )
    expect(meta, `${eventType} metadata must not use the legacy 'correct' key`).not.toHaveProperty(
      'correct',
    )
  }

  async function backdateSession(sessionId: string): Promise<void> {
    // 60s time_limit, started 91s ago → past the 30s grace, on next
    // batch_submit_quiz the RPC writes the *expired audit and ends the session.
    const past = new Date(Date.now() - 91_000).toISOString()
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ started_at: past, time_limit_seconds: 60 })
      .eq('id', sessionId)
      .select('id')
    if (error) throw new Error(`backdateSession: ${error.message}`)
    if (!data?.length) {
      throw new Error(`backdateSession: no row updated for session ${sessionId}`)
    }
  }

  async function issueCodeViaRpc(): Promise<{ codeId: string; code: string }> {
    const { data, error } = await adminAuthedClient.rpc('issue_internal_exam_code', {
      p_subject_id: subjectId,
      p_student_id: studentUserId,
    })
    expect(error, 'issue_internal_exam_code error').toBeNull()
    if (!Array.isArray(data)) {
      throw new Error(`issueCodeViaRpc: unexpected RPC return shape: ${JSON.stringify(data)}`)
    }
    const row = data[0] as { code_id: string; code: string } | undefined
    expect(row, 'issue_internal_exam_code returned empty').toBeTruthy()
    if (!row) throw new Error('unreachable')
    createdCodeIds.add(row.code_id)
    return { codeId: row.code_id, code: row.code }
  }

  test('writes quiz_session.batch_submitted on quick_quiz batch submit', async () => {
    const testStart = new Date().toISOString()

    const questionIds = await fetchActiveQuestionIds(1)
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
    createdSessionIds.add(sessionId)

    const answers = await buildAnswersForSession(sessionId)
    const { error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()

    await expectAuditRow('quiz_session.batch_submitted', studentUserId, testStart, sessionId)
  })

  test('writes exam.started when start_exam_session runs', async () => {
    const testStart = new Date().toISOString()

    const { data, error } = await studentClient.rpc('start_exam_session', {
      p_subject_id: subjectId,
    })
    expect(error).toBeNull()
    const sessionId = (data as { session_id?: string } | null)?.session_id
    expect(sessionId).toBeTruthy()
    if (sessionId) createdSessionIds.add(sessionId)

    await expectAuditRow('exam.started', studentUserId, testStart, sessionId)
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
    createdSessionIds.add(sessionId)

    const answers = await buildAnswersForSession(sessionId)
    const { error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()

    await expectAuditRow('exam.completed', studentUserId, testStart, sessionId)
    await expectCompletionMetadata({
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
    createdSessionIds.add(sessionId)

    // Within the grace window (just started) → completes as exam.completed.
    const { error: completeErr } = await studentClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })
    expect(completeErr).toBeNull()

    await expectAuditRow('exam.completed', studentUserId, testStart, sessionId)
    await expectCompletionMetadata({
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
    createdSessionIds.add(sessionId)

    await backdateSession(sessionId)

    const { error: completeErr } = await studentClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })
    expect(completeErr).toBeNull()

    await expectAuditRow('exam.expired', studentUserId, testStart, sessionId)
    await expectCompletionMetadata({
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
    createdSessionIds.add(sessionId)

    await backdateSession(sessionId)

    const answers = await buildAnswersForSession(sessionId)
    const { data: submitData, error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()
    expect((submitData as { expired?: boolean } | null)?.expired).toBe(true)

    await expectAuditRow('exam.expired', studentUserId, testStart, sessionId)
  })

  test('writes internal_exam.code_issued when admin issues a code (actor=admin)', async () => {
    const testStart = new Date().toISOString()

    const { codeId } = await issueCodeViaRpc()

    await expectAuditRow('internal_exam.code_issued', adminUserId, testStart, codeId)
  })

  test('writes internal_exam.code_voided when admin voids a code (actor=admin)', async () => {
    const testStart = new Date().toISOString()

    const { codeId } = await issueCodeViaRpc()
    const { error: voidErr } = await adminAuthedClient.rpc('void_internal_exam_code', {
      p_code_id: codeId,
      p_reason: 'audit-completeness red-team test',
    })
    expect(voidErr).toBeNull()

    await expectAuditRow('internal_exam.code_voided', adminUserId, testStart, codeId)
  })

  test('writes internal_exam.started when student redeems a valid code', async () => {
    const testStart = new Date().toISOString()

    const { code } = await issueCodeViaRpc()
    const { data, error } = await studentClient.rpc('start_internal_exam_session', {
      p_code: code,
    })
    expect(error).toBeNull()
    type StartedRow = { session_id: string }
    const row = (data as StartedRow[] | null)?.[0]
    if (!row?.session_id) {
      throw new Error('start_internal_exam_session returned no session_id')
    }
    createdSessionIds.add(row.session_id)

    await expectAuditRow('internal_exam.started', studentUserId, testStart, row.session_id)
  })

  test('writes internal_exam.completed when internal_exam batch submits within time limit', async () => {
    const testStart = new Date().toISOString()

    const { code } = await issueCodeViaRpc()
    const { data: startData, error: startErr } = await studentClient.rpc(
      'start_internal_exam_session',
      { p_code: code },
    )
    expect(startErr).toBeNull()
    type StartedRow = { session_id: string }
    const sessionId = (startData as StartedRow[] | null)?.[0]?.session_id
    expect(sessionId).toBeTruthy()
    if (!sessionId) throw new Error('no sessionId')
    createdSessionIds.add(sessionId)

    const answers = await buildAnswersForSession(sessionId)
    const { data: submitData, error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()
    // expired flag should be false on the within-time-limit path
    expect((submitData as { expired?: boolean } | null)?.expired).not.toBe(true)

    await expectAuditRow('internal_exam.completed', studentUserId, testStart, sessionId)
    await expectCompletionMetadata({
      eventType: 'internal_exam.completed',
      actorId: studentUserId,
      testStart,
      sessionId,
    })
  })

  test('writes internal_exam.expired when internal_exam session is past the grace period', async () => {
    const testStart = new Date().toISOString()

    const { code } = await issueCodeViaRpc()
    const { data: startData, error: startErr } = await studentClient.rpc(
      'start_internal_exam_session',
      { p_code: code },
    )
    expect(startErr).toBeNull()
    type StartedRow = { session_id: string }
    const sessionId = (startData as StartedRow[] | null)?.[0]?.session_id
    expect(sessionId).toBeTruthy()
    if (!sessionId) throw new Error('no sessionId')
    createdSessionIds.add(sessionId)

    await backdateSession(sessionId)

    const answers = await buildAnswersForSession(sessionId)
    const { data: submitData, error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()
    expect((submitData as { expired?: boolean } | null)?.expired).toBe(true)

    await expectAuditRow('internal_exam.expired', studentUserId, testStart, sessionId)
  })

  test('writes student.login when record_login() is invoked', async () => {
    // record_login() rate-limits at 60s — if a prior call was within the
    // window, the RPC returns without inserting. Snapshot the most recent
    // matching row before the call; afterwards either a new row exists
    // (delta), or the rate-limit kept an existing row that's still inside
    // the window. Snapshotting eliminates the false-positive where a
    // concurrent spec writes a student.login for the same actor.
    //
    // Known race (accepted): if a concurrent record_login fires for the
    // same studentUserId between the pre and post queries, the test passes
    // on the new row even though it wasn't produced by this invocation.
    // Practical risk is near-zero — Playwright runs the redteam project
    // serially, and studentUserId is the redteam-scoped attacker user.
    const { data: pre, error: preError } = await admin
      .from('audit_events')
      .select('id, created_at')
      .eq('event_type', 'student.login')
      .eq('actor_id', studentUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (preError) throw new Error(`student.login pre-query: ${preError.message}`)

    const { error } = await studentClient.rpc('record_login')
    expect(error, 'record_login error').toBeNull()

    const { data: post } = await admin
      .from('audit_events')
      .select('id, created_at')
      .eq('event_type', 'student.login')
      .eq('actor_id', studentUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    expect(post, 'expected at least one student.login row after record_login').not.toBeNull()
    if (pre?.id && post?.id === pre.id) {
      // Rate-limited path: existing row must be within the 60s window.
      const ageMs = Date.now() - new Date(post.created_at as string).getTime()
      expect(ageMs).toBeLessThan(60_000)
    }
  })

  // Vector CT (#788): positive emission for record_auth_event (mig 093). The 4
  // whitelisted auth event_types must land in the immutable audit log with the
  // correct actor (= auth.uid()) and resource_id. Called via the RPC directly,
  // not the Server Actions — the Server Actions fire it best-effort, so their
  // timing is unreliable for an audit assertion.

  test('records user.password_changed in the audit log for a self-service password change', async () => {
    const testStart = new Date().toISOString()

    // Self-service event: caller is the student, resource MUST equal the actor.
    const { error } = await studentClient.rpc('record_auth_event', {
      p_event_type: 'user.password_changed',
      p_resource_id: studentUserId,
    })
    expect(error, 'record_auth_event user.password_changed error').toBeNull()

    await expectAuditRow('user.password_changed', studentUserId, testStart, studentUserId)
  })

  test('records user.password_reset in the audit log when an admin resets a student password', async () => {
    const testStart = new Date().toISOString()

    // Admin-only event: caller is the admin, resource is the active student.
    const { error } = await adminAuthedClient.rpc('record_auth_event', {
      p_event_type: 'user.password_reset',
      p_resource_id: studentUserId,
    })
    expect(error, 'record_auth_event user.password_reset error').toBeNull()

    // actor = admin (auth.uid()), resource = the student whose password was reset.
    await expectAuditRow('user.password_reset', adminUserId, testStart, studentUserId)
  })

  test('records user.created in the audit log when an admin creates a student', async () => {
    const testStart = new Date().toISOString()

    // record_auth_event does NOT re-SELECT the resource for admin events (mig 093 —
    // the resource lookup would need a deleted_at filter that breaks user.deactivated),
    // and the real createStudent flow records the just-created user's id. A fresh UUID
    // faithfully represents that brand-new student without provisioning a persistent
    // auth user that would accumulate across runs and require extra cleanup.
    const newUserId = randomUUID()
    const { error } = await adminAuthedClient.rpc('record_auth_event', {
      p_event_type: 'user.created',
      p_resource_id: newUserId,
    })
    expect(error, 'record_auth_event user.created error').toBeNull()

    // actor = admin (auth.uid()), resource = the newly created student (not swapped).
    await expectAuditRow('user.created', adminUserId, testStart, newUserId)
  })

  test('records user.deactivated in the audit log when an admin deactivates a student', async () => {
    // Mirror the real deactivateStudent flow: by the time the audit event is
    // recorded the target is ALREADY soft-deleted. record_auth_event does not
    // re-SELECT the resource, so a soft-deleted resource_id is accepted. The
    // admin CALLER stays active — only the resource is soft-deleted.
    const { data: deleted, error: deleteErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', victimUserId)
      .select('id')
    if (deleteErr) throw new Error(`user.deactivated soft-delete target: ${deleteErr.message}`)
    if (!deleted?.length) {
      throw new Error('user.deactivated target user row not found before soft-delete')
    }
    softDeletedUserIds.add(victimUserId)

    const testStart = new Date().toISOString()
    const { error } = await adminAuthedClient.rpc('record_auth_event', {
      p_event_type: 'user.deactivated',
      p_resource_id: victimUserId,
    })
    expect(error, 'record_auth_event user.deactivated error').toBeNull()

    // actor = admin (auth.uid()), resource = the deactivated student.
    await expectAuditRow('user.deactivated', adminUserId, testStart, victimUserId)
  })
})
