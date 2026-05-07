/**
 * Red Team Spec: Audit Event Completeness (positive coverage for issue #108).
 *
 * Asserts the 8 currently-untested audit_events.event_type literals are written
 * by their triggering flows: quiz_session.batch_submitted, exam.started/.completed/.expired,
 * internal_exam.started/.code_issued/.code_voided/.expired. Negative gates
 * (forgery, tamper, delete) live in audit-event-forgery.spec.ts.
 *
 * Scope: event_type + actor_id only (metadata-shape coupling tracked in #570).
 * Each test captures testStart BEFORE the trigger, filters created_at >= testStart
 * so parallel specs don't pollute counts. Backdating uses service-role
 * (exempt from quiz_sessions immutable-columns trigger, mig 20260502000001).
 */

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
  let adminUserId: string
  let orgId: string
  let subjectId: string
  let topicId: string

  // Track sessions and codes created during tests so afterEach can clean up
  // via service-role soft-delete (sessions) or hard-delete (codes).
  const createdSessionIds = new Set<string>()
  const createdCodeIds = new Set<string>()

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
      const q = raw as { id: string; options: Array<{ id: string }> | null }
      const optionId = q.options?.[0]?.id
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
    expect(typeof sessionId).toBe('string')
    createdSessionIds.add(sessionId as string)

    const answers = await buildAnswersForSession(sessionId as string)
    const { error: submitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(submitErr).toBeNull()

    await expectAuditRow(
      'quiz_session.batch_submitted',
      studentUserId,
      testStart,
      sessionId as string,
    )
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
    const { data: pre } = await admin
      .from('audit_events')
      .select('id, created_at')
      .eq('event_type', 'student.login')
      .eq('actor_id', studentUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

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
})
