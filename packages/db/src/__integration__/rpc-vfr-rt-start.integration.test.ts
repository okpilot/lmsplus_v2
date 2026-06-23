/**
 * A.11 — VFR RT exam: normalize_answer, start_vfr_rt_exam_session, and
 * column-grant regression tests. (get_vfr_rt_exam_questions tests live in
 * rpc-vfr-rt-questions.integration.test.ts — split out in #844.)
 *
 * Each describe block seeds its own org + users + questions so they can run
 * independently. beforeAll is heavier than in the unit suite but unavoidable —
 * start_vfr_rt_exam_session requires a seeded RT subject (mig 097), per-type
 * questions, and an exam_configs row with enabled = true.
 *
 * RT subject + topics are global (seeded by mig 097); they must NOT be deleted
 * in afterAll (cleanupReferenceData would wipe them for every other test run).
 * Questions and orgs are test-scoped and cleaned up as usual.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { requireRpcResult } from './guards'
import { createTestOrg, createTestUser, getAuthenticatedClient } from './setup'
import {
  admin,
  ensureBank,
  getRtRefs,
  insertDialogFillQuestion,
  insertMcQuestion,
  insertShortAnswerQuestion,
  suffix,
} from './vfr-rt-helpers'

// ─── normalize_answer ─────────────────────────────────────────────────────────

/**
 * PostgREST 14 wraps a scalar return from a function with an unnamed TEXT
 * parameter in an anonymous-row text literal: `{ value}` (brace + space + value
 * + brace). This helper unwraps it so tests can assert the plain string.
 *
 * Pattern confirmed against the local stack:
 *   normalize_answer("Hello World") → PostgREST body = `"{ hello world}"`
 *   normalize_answer("")            → PostgREST body = `"{ }"`
 */
/**
 * Strip the PostgreSQL anonymous-row text wrapper that PostgREST 14 applies to
 * scalar returns from functions with unnamed parameters.
 *
 * Examples observed on local stack (PostgREST 14.12):
 *   normalize_answer("hello")     → "{hello}"   → slice+trim → "hello"
 *   normalize_answer("  Hello  ") → "{ hello }" → slice+trim → "hello"
 *   normalize_answer("")          → "{}"        → slice+trim → ""
 *   normalize_answer("Č")         → "{č}"       → slice+trim → "č"
 */
function unwrapPostgrestScalar(raw: unknown): string {
  if (typeof raw !== 'string') return String(raw)
  // Strip enclosing braces and trim any surrounding whitespace that PG adds
  // when the value itself started/ended with whitespace.
  return raw.slice(1, -1).trim()
}

/**
 * Call normalize_answer via the PostgREST REST API.
 * normalize_answer(text) has a single positional TEXT parameter with no name
 * in the pg_proc entry; PostgREST maps it as the empty-string JSON key "".
 */
async function callNormalizeAnswer(input: string): Promise<string> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/normalize_answer`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
    },
    body: JSON.stringify({ '': input }),
  })
  const body: unknown = await resp.json()
  return unwrapPostgrestScalar(body)
}

describe('SQL function: normalize_answer', () => {
  it('preserves Slovenian diacritics — Č lowercases to č, not c', async () => {
    // Primary locale-regression guard (design.md § Migration 101).
    // A deployment under tr_TR or C/POSIX locale folds Č→c, breaking the exam grader.
    const result = await callNormalizeAnswer('Č')
    expect(result).toBe('č')
    // Explicitly assert it is NOT 'c' — the fold-to-ASCII failure mode
    expect(result).not.toBe('c')
  })

  it.each([
    // [input, expected] — mirrors the TS normalizeAnswer() test table (design.md § Utility)
    ['  Hello  ', 'hello'],
    ['MAYDAY', 'mayday'],
    ['cross-wind', 'cross wind'],
    ['cross_wind', 'cross wind'],
    ['S5-ABC', 's5 abc'],
    ['roger.', 'roger'],
    ['(affirm)', 'affirm'],
    ['ATIS,', 'atis'],
    // Pins verified behavior: the POSIX ARE bracket-class in the function's
    // regex honors backslash escapes, so literal [ and ] ARE stripped as
    // punctuation. An external reviewer claimed otherwise (false positive);
    // verified live: SELECT normalize_answer('test[bracket]') = 'testbracket'.
    ['test[bracket]', 'testbracket'],
    // Note: `"cleared"` (input with literal double-quotes) is NOT included here.
    // When the body is `{"":"\"cleared\""}`, PostgREST passes the JSON-encoded
    // backslash escapes verbatim to the unnamed TEXT param, so the function
    // receives `\"cleared\"` (backslashes included). The `"` chars are stripped
    // but the `\` chars survive, returning `\cleared\` instead of `cleared`.
    // Verified via psql: `SELECT normalize_answer('"cleared"') = 'cleared'` ✓
    // The `"` stripping rule is indirectly exercised by the punctuation cases above.
    ['two  spaces', 'two spaces'],
    ['č', 'č'],
    ['Č', 'č'],
    ['š', 'š'],
    ['ž', 'ž'],
    ['', ''],
    // Final-trim cases (#921): punctuation adjacent to an edge space must not
    // leave a stray edge space, or grading penalizes a correct answer. Mirrors
    // the TS normalizeAnswer() table — parity is contractual (mig 128).
    ['. hello', 'hello'],
    ['hello .', 'hello'],
    ['. hello .', 'hello'],
    ['  .  hello  ', 'hello'],
    ['  .  ', ''],
  ])('normalizes %j to %j', async (input: string, expected: string) => {
    const result = await callNormalizeAnswer(input)
    expect(result).toBe(expected)
  })
})

// ─── start_vfr_rt_exam_session ────────────────────────────────────────────────

describe('RPC: start_vfr_rt_exam_session', () => {
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let rtSubjectId: string
  let p1TopicId: string
  let p2TopicId: string
  let p3TopicId: string
  const userIds: string[] = []

  beforeAll(async () => {
    const refs = await getRtRefs()
    rtSubjectId = refs.rtSubjectId
    p1TopicId = refs.p1TopicId
    p2TopicId = refs.p2TopicId
    p3TopicId = refs.p3TopicId

    orgId = await createTestOrg({
      admin,
      name: `RT Start Org ${suffix}`,
      slug: `rt-start-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-rtstart-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-rtstart-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-rtstart-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    const bankId = await ensureBank(orgId, adminUserId)

    // Seed the minimum pool: 8 short_answer + 9 dialog_fill + 8 multiple_choice
    for (let i = 0; i < 8; i++) {
      await insertShortAnswerQuestion({
        orgId,
        bankId,
        adminId: adminUserId,
        rtSubjectId,
        p1TopicId,
        idx: i,
      })
    }
    for (let i = 0; i < 9; i++) {
      await insertDialogFillQuestion({
        orgId,
        bankId,
        adminId: adminUserId,
        rtSubjectId,
        p2TopicId,
        idx: i,
      })
    }
    for (let i = 0; i < 8; i++) {
      await insertMcQuestion({
        orgId,
        bankId,
        adminId: adminUserId,
        rtSubjectId,
        p3TopicId,
        idx: i,
      })
    }

    // Seed an enabled exam_configs row for this org + RT subject
    const { error: ecErr } = await admin.from('exam_configs').insert({
      organization_id: orgId,
      subject_id: rtSubjectId,
      enabled: true,
      total_questions: 25,
      time_limit_seconds: 1800,
      pass_mark: 75,
    })
    if (ecErr) throw new Error(`exam_configs insert: ${ecErr.message}`)
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    // Note: do NOT call cleanupReferenceData for RT subject/topics — they are
    // global seed data inserted by mig 097 and must persist across test runs.
  })

  it('rejects an unauthenticated call with not_authenticated', async () => {
    // Use the anon key client (no auth.uid())
    const anonClient = await import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } },
      ),
    )
    const { error } = await anonClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_authenticated')
  })

  it('rejects when no exam_configs row exists for the org', async () => {
    // Create a second org with no exam_configs row
    const orgId2 = await createTestOrg({
      admin,
      name: `RT No Config Org ${suffix}`,
      slug: `rt-nocfg-${suffix}`,
    })
    const studentId2 = await createTestUser({
      admin,
      orgId: orgId2,
      email: `student-rtnc-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    const client2 = await getAuthenticatedClient({
      email: `student-rtnc-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const { error } = await client2.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('exam_config_required')

    // Cleanup the second org
    await cleanupTestData({ admin, orgId: orgId2, userIds: [studentId2] })
  })

  it('raises insufficient_questions_for_vfr_rt_exam when any part pool is short', async () => {
    // Create a separate org with only 1 short_answer question (Part 1 needs 8)
    const orgId3 = await createTestOrg({
      admin,
      name: `RT Short Pool Org ${suffix}`,
      slug: `rt-short-${suffix}`,
    })
    const adminId3 = await createTestUser({
      admin,
      orgId: orgId3,
      email: `admin-rtshort-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    const studentId3 = await createTestUser({
      admin,
      orgId: orgId3,
      email: `student-rtshort-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    const client3 = await getAuthenticatedClient({
      email: `student-rtshort-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const bankId3 = await ensureBank(orgId3, adminId3)
    // Only 1 short_answer — far below the 8-question minimum
    await insertShortAnswerQuestion({
      orgId: orgId3,
      bankId: bankId3,
      adminId: adminId3,
      rtSubjectId,
      p1TopicId,
      idx: 99,
    })
    const { error: ecErr } = await admin.from('exam_configs').insert({
      organization_id: orgId3,
      subject_id: rtSubjectId,
      enabled: true,
      total_questions: 25,
      time_limit_seconds: 1800,
      pass_mark: 75,
    })
    if (ecErr) throw new Error(`short pool ec insert: ${ecErr.message}`)

    const { error } = await client3.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('insufficient_questions_for_vfr_rt_exam')

    await cleanupTestData({ admin, orgId: orgId3, userIds: [adminId3, studentId3] })
  })

  it('a second concurrent active session for the same student and subject is rejected with a unique violation (23505)', async () => {
    // Schema-level race guard (uq_vfr_rt_exam_session_active, mig 096): two
    // concurrent first calls can both pass the RPC's idempotent-resume SELECT;
    // the partial unique index makes the loser's INSERT fail with 23505 instead
    // of creating a duplicate active session. Asserted via direct service-role
    // INSERTs — the index, not the RPC body, is the defense under test.
    const insertActiveSession = () =>
      admin
        .from('quiz_sessions')
        .insert({
          organization_id: orgId,
          student_id: studentId,
          mode: 'vfr_rt_exam',
          subject_id: rtSubjectId,
          config: {},
          total_questions: 25,
          time_limit_seconds: 1800,
        })
        .select('id')
        .single<{ id: string }>()

    const { data: first, error: firstErr } = await insertActiveSession()
    try {
      expect(firstErr).toBeNull()
      expect(first?.id).toBeTruthy()

      const { error: secondErr } = await insertActiveSession()
      expect(secondErr).not.toBeNull()
      // 23505 = unique_violation (uq_vfr_rt_exam_session_active)
      expect(secondErr?.code).toBe('23505')
    } finally {
      // Soft-delete the directly-inserted row(s) so the happy-path/resume tests
      // below see no active session (hard DELETE on quiz_sessions is forbidden).
      // console.error, not throw: a throw here would mask the test's own
      // assertion failure (biome noUnsafeFinally).
      const { data: discarded, error: cleanupErr } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', studentId)
        .eq('organization_id', orgId)
        .eq('subject_id', rtSubjectId)
        .eq('mode', 'vfr_rt_exam')
        .is('ended_at', null)
        .is('deleted_at', null)
        .select('id')
      if (cleanupErr) {
        console.error(
          '[uq_vfr_rt cleanup] soft-delete failed — active session left behind:',
          cleanupErr.message,
        )
      } else if ((discarded?.length ?? 0) > 0) {
        console.log(`[uq_vfr_rt cleanup] soft-deleted ${discarded?.length} session(s)`)
      }
    }
  })

  it('happy path — returns session_id, 25 question_ids, parts boundaries, time_limit_seconds', async () => {
    const { data, error } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(error).toBeNull()
    const result = requireRpcResult<{
      session_id: string
      question_ids: string[]
      time_limit_seconds: number
      parts: { p1_end: number; p2_end: number; p3_end: number }
      started_at: string
    }>(data, 'start_vfr_rt_exam_session')
    expect(result).toBeTruthy()
    expect(typeof result.session_id).toBe('string')
    expect(result.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(Array.isArray(result.question_ids)).toBe(true)
    expect(result.question_ids).toHaveLength(25)
    expect(result.time_limit_seconds).toBe(1800)
    expect(result.parts).toMatchObject({ p1_end: 8, p2_end: 17, p3_end: 25 })
    expect(typeof result.started_at).toBe('string')
  })

  it('second call for the same student returns the same session (idempotent resume)', async () => {
    // The first call above already created a session. A second call must resume it.
    const { data: firstData, error: err1 } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(err1).toBeNull()
    const first = requireRpcResult<{ session_id: string; question_ids: string[] }>(
      firstData,
      'start_vfr_rt_exam_session',
    )

    const { data: secondData, error: err2 } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(err2).toBeNull()
    const second = requireRpcResult<{ session_id: string; question_ids: string[] }>(
      secondData,
      'start_vfr_rt_exam_session',
    )

    // Same session id
    expect(second.session_id).toBe(first.session_id)
    // Same frozen question set (order matters — IDs are sampled once and locked)
    expect(second.question_ids).toEqual(first.question_ids)
  })

  it('allows a new session after the previous one is ended (index predicate: ended_at IS NULL)', async () => {
    // uq_vfr_rt_exam_session_active only covers rows where ended_at IS NULL.
    // An ended session must no longer block INSERTs — this is the contractual
    // guarantee that lets a student take the exam more than once.
    //
    // At this point the describe block's happy-path test has already created
    // and the idempotent-resume test has returned an active session. Capture
    // it, end it via direct admin UPDATE, then assert a fresh call returns a
    // brand-new session_id (not the ended one).
    const { data: activeData, error: activeErr } = await studentClient.rpc(
      'start_vfr_rt_exam_session',
      { p_subject_id: rtSubjectId },
    )
    expect(activeErr).toBeNull()
    const active = requireRpcResult<{ session_id: string }>(activeData, 'start_vfr_rt_exam_session')

    // Force-end the session (simulate exam completion at DB level).
    const { data: closed, error: closeErr } = await admin
      .from('quiz_sessions')
      .update({
        ended_at: new Date().toISOString(),
        correct_count: 0,
        score_percentage: 0,
        passed: false,
      })
      .eq('id', active.session_id)
      .select('id')
    expect(closeErr).toBeNull()
    expect(closed).toHaveLength(1)

    // A new start call must now succeed and return a DIFFERENT session_id —
    // proving the ended row no longer occupies the partial unique index slot.
    const { data: newData, error: newErr } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(newErr).toBeNull()
    const newSession = requireRpcResult<{ session_id: string; question_ids: string[] }>(
      newData,
      'start_vfr_rt_exam_session',
    )
    expect(typeof newSession.session_id).toBe('string')
    expect(newSession.session_id).not.toBe(active.session_id)
    expect(Array.isArray(newSession.question_ids)).toBe(true)
    expect(newSession.question_ids).toHaveLength(25)
  })
})

// ─── Column-grant regression (mig 094) ────────────────────────────────────────

describe('Column grant (mig 094) — student cannot directly SELECT answer-key columns', () => {
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let rtSubjectId: string
  let p1TopicId: string
  let saId: string
  const userIds: string[] = []

  beforeAll(async () => {
    const refs = await getRtRefs()
    rtSubjectId = refs.rtSubjectId
    p1TopicId = refs.p1TopicId

    orgId = await createTestOrg({
      admin,
      name: `RT Grant Org ${suffix}`,
      slug: `rt-grant-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-rtgrant-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-rtgrant-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-rtgrant-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    const bankId = await ensureBank(orgId, adminUserId)
    saId = await insertShortAnswerQuestion({
      orgId,
      bankId,
      adminId: adminUserId,
      rtSubjectId,
      p1TopicId,
      idx: 300,
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
  })

  it('direct PostgREST SELECT of canonical_answer by a same-org student fails with 42501', async () => {
    // The mig 094 column-level REVOKE blocks authenticated role from selecting
    // the four answer-key columns. RLS alone does NOT block this — the
    // tenant_isolation policy is org-scoped, so a same-org student passes it.
    // This test asserts that the privilege layer (not RLS) is the defense.
    const { data, error } = await studentClient
      .from('questions')
      .select('canonical_answer')
      .eq('id', saId)

    // The PostgREST request must fail with a 42501 permission error
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('direct PostgREST SELECT of granted columns (id, question_text) by a same-org student succeeds', async () => {
    // Non-vacuous positive control: the student can still SELECT the non-revoked
    // columns, confirming the REVOKE is column-scoped, not table-scoped.
    const { data, error } = await studentClient
      .from('questions')
      .select('id, question_text')
      .eq('id', saId)

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    const rows = data as unknown as Array<{ id: string; question_text: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(saId)
    expect(typeof rows[0]!.question_text).toBe('string')
  })
})
