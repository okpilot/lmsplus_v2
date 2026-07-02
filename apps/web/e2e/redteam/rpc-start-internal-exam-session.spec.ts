/**
 * Red Team Spec: start_internal_exam_session RPC
 *
 * Vectors CX / CY / CZ / DA / DB / DC (HIGH/MEDIUM): student-facing RPC that redeems a
 * single-use code and creates an internal_exam quiz_session.
 *  - CX: unauthenticated → 'not_authenticated'
 *  - CY: student-B uses student-A's code → 'code_not_yours' (cross-student)
 *  - CZ: expired code → 'code_expired'
 *  - DA: voided code  → 'code_voided'
 *  - DB:  double-redemption / consumed code → 'code_already_used'
 *  - extra: starting a second concurrent code while a session is already
 *           active for the same subject → 'active_session_exists'
 *  - DC: overdue active session is auto-completed and new session starts
 *        successfully (mig 071 column-qualification fix + PERFORM branch)
 *
 * Status: Expected to PASS — every guard is in the SECURITY DEFINER body.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_CODE_PREFIX } from './helpers/seed-markers'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type CodeRow = { id: string; code: string; syntheticSessionId?: string }

async function seedCode(
  admin: ReturnType<typeof getAdminClient>,
  opts: {
    studentId: string
    subjectId: string
    orgId: string
    expiresInMs?: number
    consumedAt?: string | null
    consumedSessionId?: string | null
    voidedAt?: string | null
    voidedBy?: string | null
  },
): Promise<CodeRow> {
  // crypto.randomUUID() is collision-resistant; Math.random() can collide
  // across rapid test runs in the same describe block.
  const code = `${E2E_REDTEAM_CODE_PREFIX}${crypto
    .randomUUID()
    .replace(/-/g, '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, 'A')
    .slice(0, 6)}`
  const expiresAt = new Date(Date.now() + (opts.expiresInMs ?? 60 * 60 * 1000)).toISOString()
  const insertRow: Record<string, unknown> = {
    code,
    subject_id: opts.subjectId,
    student_id: opts.studentId,
    issued_by: opts.studentId, // FK satisfaction; not exercised by the RPC
    expires_at: expiresAt,
    organization_id: opts.orgId,
  }
  let syntheticSessionId: string | undefined
  if (opts.consumedAt) {
    insertRow.consumed_at = opts.consumedAt
    // CHECK constraint consumed_pair_consistency requires consumed_session_id
    // and consumed_at to be NULL together or both set together. When the caller
    // doesn't provide a real session id, synthesise a placeholder quiz_session
    // so the seed satisfies the constraint and the RPC's read-side guard runs.
    let sessionId = opts.consumedSessionId
    if (!sessionId) {
      const { data: sessionRow, error: sessionErr } = await admin
        .from('quiz_sessions')
        .insert({
          organization_id: opts.orgId,
          student_id: opts.studentId,
          mode: 'internal_exam',
          subject_id: opts.subjectId,
          config: { question_ids: [] },
          total_questions: 0,
          ended_at: opts.consumedAt,
        })
        .select('id')
        .single()
      if (sessionErr || !sessionRow) {
        throw new Error(`seedCode placeholder session: ${sessionErr?.message}`)
      }
      sessionId = sessionRow.id
      // Surface the synthetic session id so callers can register it for cleanup.
      syntheticSessionId = sessionId
    }
    insertRow.consumed_session_id = sessionId
  }
  if (opts.voidedAt) {
    insertRow.voided_at = opts.voidedAt
    insertRow.voided_by = opts.voidedBy ?? opts.studentId
  }
  const { data, error } = await admin
    .from('internal_exam_codes')
    .insert(insertRow)
    .select('id, code')
    .single()
  if (error || !data) throw new Error(`seedCode: ${error?.message}`)
  return { ...data, syntheticSessionId }
}

test.describe('Red Team: start_internal_exam_session RPC', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let victimUserId: string
  let orgId: string
  let subjectId: string

  // Sessions created during tests (by the RPC or by admin seed) are tracked
  // here so afterEach can soft-delete them and keep the spec hermetic.
  const createdSessionIds = new Set<string>()

  test.afterEach(async () => {
    if (createdSessionIds.size === 0) return
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(createdSessionIds))
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`afterEach soft-delete sessions: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(
          `[start-internal-exam-session afterEach] soft-deleted ${data?.length} session(s)`,
        )
      }
    } finally {
      createdSessionIds.clear()
    }
  })

  test.beforeAll(async () => {
    admin = getAdminClient()

    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId
    victimUserId = seed.victimUserId
    orgId = seed.orgId

    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)

    // Resolve subject + topic from egmont and ensure an exam_config exists so
    // the RPC can reach the active-session / consumption code paths.
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    const topicId = picked.topicId

    await ensureExamConfig(orgId, subjectId, topicId)
  })

  // Single-active-session invariant (#1011): the attacker and victim are shared
  // across red-team specs. A leftover active session makes the "second code"
  // start raise `another_session_active` (cross-mode) and makes the DC overdue
  // admin-INSERT collide with uq_one_active_session_per_student (23505). Clear
  // both students' active sessions before each test for a clean baseline.
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
  })

  test('unauthenticated call returns not_authenticated (Vector CX)', async () => {
    const { data, error } = await unauthClient.rpc('start_internal_exam_session', {
      p_code: 'NEVERUSED',
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data).toBeNull()
  })

  test('student-B using student-A code is rejected without disclosing existence (Vector CY)', async () => {
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
    })

    // Capture testStart BEFORE the redemption attempt so the probe ignores
    // attacker sessions created by sibling tests (CZ/DA/DB/etc.) and prior runs
    // that did not get cleaned up.
    const testStart = new Date().toISOString()

    // Attacker (student-B) tries to redeem the victim's code.
    const { data, error } = await attackerClient.rpc('start_internal_exam_session', {
      p_code: code.code,
    })

    expect(error).not.toBeNull()
    // The RPC raises 'code_not_yours'; spec-design also accepts 'code_not_found'
    // as an existence-hiding alternative. Either is a valid generic error and
    // must NOT leak any session id, exam config, or question ids.
    expect(error?.message ?? '').toMatch(/code_not_yours|code_not_found/i)
    expect(data).toBeNull()

    // Belt-and-braces: no session was created for the attacker against the
    // victim's code during this test. Scope to subject + org so unrelated
    // sessions from other specs in the same window can't inflate the count.
    const { data: probe } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', attackerUserId)
      .eq('mode', 'internal_exam')
      .eq('subject_id', subjectId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .gte('created_at', testStart)
    expect((probe ?? []).length).toBe(0)
  })

  test('expired code is rejected with code_expired (Vector CZ)', async () => {
    // Insert a code that was already expired one minute ago.
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      expiresInMs: -60_000,
    })

    const { data, error } = await victimClient.rpc('start_internal_exam_session', {
      p_code: code.code,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/code_expired/i)
    expect(data).toBeNull()
  })

  test('voided code is rejected with code_voided (Vector DA)', async () => {
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      voidedAt: new Date().toISOString(),
      voidedBy: victimUserId,
    })

    const { data, error } = await victimClient.rpc('start_internal_exam_session', {
      p_code: code.code,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/code_voided/i)
    expect(data).toBeNull()
  })

  test('already-consumed code is rejected with code_already_used (Vector DB)', async () => {
    // Seed a code marked consumed via direct admin insert (skips the FOR UPDATE
    // lock that the RPC uses; the read-side guard `IF v_code_consumed IS NOT NULL`
    // is what we're exercising).
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      consumedAt: new Date().toISOString(),
    })
    // seedCode creates a synthetic quiz_session to satisfy the consumed_pair_consistency
    // CHECK constraint; register it so afterEach soft-deletes it.
    if (code.syntheticSessionId) createdSessionIds.add(code.syntheticSessionId)

    const { data, error } = await victimClient.rpc('start_internal_exam_session', {
      p_code: code.code,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/code_already_used/i)
    expect(data).toBeNull()
  })

  test('second valid code for same subject while a session is active raises active_session_exists', async () => {
    // Issue two valid (non-consumed, non-voided, future-expiry) codes for the
    // same student + subject. Redeem the first to create an active session,
    // then attempt the second — must hit the duplicate-active guard.
    const code1 = await seedCode(admin, {
      studentId: attackerUserId,
      subjectId,
      orgId,
    })
    const code2 = await seedCode(admin, {
      studentId: attackerUserId,
      subjectId,
      orgId,
    })

    const first = await attackerClient.rpc('start_internal_exam_session', {
      p_code: code1.code,
    })
    // The first redemption requires sufficient questions in the configured
    // distribution. If the test fixture lacks them, the RPC raises
    // 'insufficient_questions_for_exam' before reaching the active-session
    // guard. Skip the assertion in that case (covered by SQL integration tests).
    if (first.error && /insufficient_questions/i.test(first.error.message)) {
      test.skip(
        true,
        'insufficient seeded questions for exam_config — fixture limitation; covered by SQL integration tests',
      )
      return
    }
    expect(first.error).toBeNull()

    // Track the session created by the first redemption so afterEach cleans it up.
    const newSessionId = (first.data as Array<{ session_id: string }>)?.[0]?.session_id
    if (newSessionId) createdSessionIds.add(newSessionId)

    const second = await attackerClient.rpc('start_internal_exam_session', {
      p_code: code2.code,
    })
    expect(second.error).not.toBeNull()
    expect(second.error?.message ?? '').toMatch(/active_session_exists/i)
    expect(second.data).toBeNull()
  })

  test('overdue active session is auto-completed and the fresh code starts a new session without error (Vector DC)', async () => {
    // Seed an ACTIVE internal_exam session for the attacker that is well past
    // its grace window. The RPC checks (mig 071, line 99-113):
    //   now() > qs.started_at + ((qs.time_limit_seconds + 30) || ' seconds')::interval
    // With started_at = now()-2h and time_limit_seconds=600 the check evaluates
    // to now() > (now()-2h + 630s), i.e. now() > (now()-~110min) — TRUE.
    // mig 071 also fixed the 42702 column-ambiguity bug that made this branch
    // unreachable: qs.* qualification prevents Postgres confusing quiz_sessions
    // columns with the RETURNS TABLE output columns of the same name.
    const overdueStartedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
    const { data: oldSessionRow, error: oldSessionErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: attackerUserId,
        mode: 'internal_exam',
        subject_id: subjectId,
        config: { question_ids: [], pass_mark: 75 },
        total_questions: 1,
        time_limit_seconds: 600, // 10 min limit — well within the 2h backdated start
        started_at: overdueStartedAt,
      })
      .select('id')
      .single()
    if (oldSessionErr || !oldSessionRow) {
      throw new Error(`DC seed overdue session: ${oldSessionErr?.message}`)
    }
    const oldSessionId = oldSessionRow.id
    createdSessionIds.add(oldSessionId)

    // Non-vacuity: confirm the old session is ACTIVE (ended_at IS NULL) before
    // we redeem the fresh code. This ensures the subsequent "ended_at IS NOT NULL"
    // assertion proves auto-completion, not a pre-existing closed session.
    const { data: preCheck, error: preCheckErr } = await admin
      .from('quiz_sessions')
      .select('ended_at')
      .eq('id', oldSessionId)
      .single()
    expect(preCheckErr).toBeNull()
    expect(preCheck?.ended_at).toBeNull()

    // Issue a fresh code for the same student + subject.
    const freshCode = await seedCode(admin, {
      studentId: attackerUserId,
      subjectId,
      orgId,
    })

    // Redeem the fresh code as the attacker. The RPC should:
    //   1. Detect the overdue session via the grace-window SELECT (mig 071 lines 99-110).
    //   2. Call PERFORM complete_overdue_exam_session(v_old_session_id) (line 112).
    //   3. Proceed to the active-session guard — which now finds no open session.
    //   4. Create and return a new session.
    const { data: redeemData, error: redeemErr } = await attackerClient.rpc(
      'start_internal_exam_session',
      { p_code: freshCode.code },
    )

    // Skip if the fixture lacks questions — the exam_config distribution check
    // fires before the overdue branch and is a separate concern.
    if (redeemErr && /insufficient_questions/i.test(redeemErr.message)) {
      test.skip(
        true,
        'insufficient seeded questions for exam_config — fixture limitation; covered by SQL integration tests',
      )
      return
    }

    // No 42702 column-ambiguity error and no active_session_exists error.
    expect(redeemErr).toBeNull()
    expect(redeemData).not.toBeNull()

    // The new session id is returned in the first row of the RETURNS TABLE result.
    const newSessionId = (redeemData as Array<{ session_id: string }>)?.[0]?.session_id
    expect(newSessionId).toBeTruthy()
    if (newSessionId) createdSessionIds.add(newSessionId)

    // The RPC must have created a DISTINCT new session, not returned the
    // auto-completed overdue row. If the RPC regressed to completing the old
    // session and returning it, newSessionId === oldSessionId and this fails.
    expect(newSessionId).not.toBe(oldSessionId)

    // The new session must be fresh/active (ended_at IS NULL). If the RPC
    // returned the just-completed overdue session instead of creating a new one,
    // ended_at would be set and this assertion would catch the regression.
    const { data: newSessionCheck, error: newSessionCheckErr } = await admin
      .from('quiz_sessions')
      .select('ended_at')
      .eq('id', newSessionId)
      .single()
    expect(newSessionCheckErr).toBeNull()
    expect(newSessionCheck?.ended_at).toBeNull()

    // The OLD session must now have ended_at set — auto-completed by the PERFORM branch.
    const { data: postCheck, error: postCheckErr } = await admin
      .from('quiz_sessions')
      .select('ended_at')
      .eq('id', oldSessionId)
      .single()
    expect(postCheckErr).toBeNull()
    expect(postCheck?.ended_at).not.toBeNull()
  })
})
