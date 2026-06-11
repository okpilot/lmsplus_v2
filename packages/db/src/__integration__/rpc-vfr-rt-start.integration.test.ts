/**
 * A.11 — VFR RT exam: normalize_answer, start_vfr_rt_exam_session,
 * get_vfr_rt_exam_questions, and column-grant regression tests.
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
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

const admin = getAdminClient()
const suffix = Date.now()

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Insert a minimal short_answer question owned by the test org into the RT subject. */
async function insertShortAnswerQuestion(opts: {
  orgId: string
  bankId: string
  adminId: string
  rtSubjectId: string
  p1TopicId: string
  idx: number
}): Promise<string> {
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: opts.orgId,
      bank_id: opts.bankId,
      subject_id: opts.rtSubjectId,
      topic_id: opts.p1TopicId,
      question_text: `SA question ${opts.idx} ${suffix}?`,
      explanation_text: `SA explanation ${opts.idx}`,
      question_type: 'short_answer',
      canonical_answer: `answer_${opts.idx}`,
      accepted_synonyms: [`syn_${opts.idx}`, `syn_${opts.idx}b`],
      options: [],
      blanks_config: [],
      difficulty: 'medium',
      status: 'active',
      created_by: opts.adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertShortAnswerQuestion: ${error.message}`)
  return data.id as string
}

/** Insert a minimal dialog_fill question. blanks_config must be non-empty array. */
async function insertDialogFillQuestion(opts: {
  orgId: string
  bankId: string
  adminId: string
  rtSubjectId: string
  p2TopicId: string
  idx: number
}): Promise<string> {
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: opts.orgId,
      bank_id: opts.bankId,
      subject_id: opts.rtSubjectId,
      topic_id: opts.p2TopicId,
      question_text: `DF question ${opts.idx} ${suffix}?`,
      explanation_text: `DF explanation ${opts.idx}`,
      question_type: 'dialog_fill',
      dialog_template: `[atc] Cleared to land runway 28. {{0|S5-ABC;S5-XYZ}} report base.`,
      blanks_config: [{ index: 0, canonical: 'S5-ABC', synonyms: ['S5-XYZ'] }],
      options: [],
      difficulty: 'medium',
      status: 'active',
      created_by: opts.adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertDialogFillQuestion: ${error.message}`)
  return data.id as string
}

/** Insert a minimal multiple_choice question into the RT subject. */
async function insertMcQuestion(opts: {
  orgId: string
  bankId: string
  adminId: string
  rtSubjectId: string
  p3TopicId: string
  idx: number
}): Promise<string> {
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: opts.orgId,
      bank_id: opts.bankId,
      subject_id: opts.rtSubjectId,
      topic_id: opts.p3TopicId,
      question_text: `MC question ${opts.idx} ${suffix}?`,
      explanation_text: `MC explanation ${opts.idx}`,
      question_type: 'multiple_choice',
      options: [
        { id: 'a', text: `Option A ${opts.idx}`, correct: false },
        { id: 'b', text: `Option B ${opts.idx}`, correct: true },
        { id: 'c', text: `Option C ${opts.idx}`, correct: false },
        { id: 'd', text: `Option D ${opts.idx}`, correct: false },
      ],
      difficulty: 'medium',
      status: 'active',
      created_by: opts.adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertMcQuestion: ${error.message}`)
  return data.id as string
}

/** Resolve the RT subject id and its three part-topic ids from the seeded mig 097 data. */
async function getRtRefs(): Promise<{
  rtSubjectId: string
  p1TopicId: string
  p2TopicId: string
  p3TopicId: string
}> {
  const { data: sub, error: subErr } = await admin
    .from('easa_subjects')
    .select('id')
    .eq('code', 'RT')
    .single()
  if (subErr || !sub) throw new Error(`getRtRefs: RT subject not found — run mig 097`)

  const { data: topics, error: topErr } = await admin
    .from('easa_topics')
    .select('id, code')
    .eq('subject_id', sub.id)
    .in('code', ['P1_ACRONYMS', 'P2_DIALOG', 'P3_MC'])
  if (topErr) throw new Error(`getRtRefs: ${topErr.message}`)
  const byCode = Object.fromEntries(
    (topics ?? []).map((t: { id: string; code: string }) => [t.code, t.id]),
  )
  if (!byCode['P1_ACRONYMS'] || !byCode['P2_DIALOG'] || !byCode['P3_MC'])
    throw new Error('getRtRefs: one or more RT topics missing — run mig 097')
  return {
    rtSubjectId: sub.id,
    p1TopicId: byCode['P1_ACRONYMS'],
    p2TopicId: byCode['P2_DIALOG'],
    p3TopicId: byCode['P3_MC'],
  }
}

/** Ensure a question_banks row exists for the org and return its id. */
async function ensureBank(orgId: string, adminId: string): Promise<string> {
  const { data: existing, error: lookupErr } = await admin
    .from('question_banks')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (lookupErr) throw new Error(`ensureBank lookup: ${lookupErr.message}`)
  if (existing) return existing.id as string
  const { data, error } = await admin
    .from('question_banks')
    .insert({ organization_id: orgId, name: `RT Test Bank ${suffix}`, created_by: adminId })
    .select('id')
    .single()
  if (error) throw new Error(`ensureBank insert: ${error.message}`)
  return data.id as string
}

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
  const url = `${process.env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/rpc/normalize_answer`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
      Authorization: `Bearer ${process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''}`,
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
        process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
        process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
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
    const result = data as unknown as {
      session_id: string
      question_ids: string[]
      time_limit_seconds: number
      parts: { p1_end: number; p2_end: number; p3_end: number }
      started_at: string
    }
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
    const first = firstData as unknown as { session_id: string; question_ids: string[] }

    const { data: secondData, error: err2 } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(err2).toBeNull()
    const second = secondData as unknown as { session_id: string; question_ids: string[] }

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
    const active = activeData as unknown as { session_id: string }

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
    const newSession = newData as unknown as { session_id: string; question_ids: string[] }
    expect(typeof newSession.session_id).toBe('string')
    expect(newSession.session_id).not.toBe(active.session_id)
    expect(Array.isArray(newSession.question_ids)).toBe(true)
    expect(newSession.question_ids).toHaveLength(25)
  })
})

// ─── get_vfr_rt_exam_questions ────────────────────────────────────────────────

describe('RPC: get_vfr_rt_exam_questions', () => {
  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let rtSubjectId: string
  let p1TopicId: string
  let p2TopicId: string
  let p3TopicId: string
  let saIds: string[]
  let dfIds: string[]
  let mcIds: string[]
  let saId: string
  let dfId: string
  let mcId: string
  // The caller-owned in-flight session every happy-path test reads through.
  // #833 contract: the RPC takes p_session_id and derives the question ids
  // server-side from the session's frozen config.question_ids — callers can no
  // longer pass arbitrary question id arrays.
  let sessionId: string
  let sessionQuestionIds: string[]
  const userIds: string[] = []

  beforeAll(async () => {
    const refs = await getRtRefs()
    rtSubjectId = refs.rtSubjectId
    p1TopicId = refs.p1TopicId
    p2TopicId = refs.p2TopicId
    p3TopicId = refs.p3TopicId

    orgId = await createTestOrg({
      admin,
      name: `RT Questions Org ${suffix}`,
      slug: `rt-qs-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-rtqs-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-rtqs-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)
    studentClient = await getAuthenticatedClient({
      email: `student-rtqs-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    const bankId = await ensureBank(orgId, adminUserId)

    // Seed EXACTLY the 8/9/8 part minimum: the sampler then has no slack, so the
    // started session's 25 frozen question_ids necessarily include every seeded
    // question — tests can locate saId/dfId/mcId in the RPC response.
    saIds = []
    for (let i = 0; i < 8; i++) {
      saIds.push(
        await insertShortAnswerQuestion({
          orgId,
          bankId,
          adminId: adminUserId,
          rtSubjectId,
          p1TopicId,
          idx: 200 + i,
        }),
      )
    }
    dfIds = []
    for (let i = 0; i < 9; i++) {
      dfIds.push(
        await insertDialogFillQuestion({
          orgId,
          bankId,
          adminId: adminUserId,
          rtSubjectId,
          p2TopicId,
          idx: 200 + i,
        }),
      )
    }
    mcIds = []
    for (let i = 0; i < 8; i++) {
      mcIds.push(
        await insertMcQuestion({
          orgId,
          bankId,
          adminId: adminUserId,
          rtSubjectId,
          p3TopicId,
          idx: 200 + i,
        }),
      )
    }
    saId = saIds[0]!
    dfId = dfIds[0]!
    mcId = mcIds[0]!

    const { error: ecErr } = await admin.from('exam_configs').insert({
      organization_id: orgId,
      subject_id: rtSubjectId,
      enabled: true,
      total_questions: 25,
      time_limit_seconds: 1800,
      pass_mark: 75,
    })
    if (ecErr) throw new Error(`exam_configs insert: ${ecErr.message}`)

    const { data, error } = await studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    if (error) throw new Error(`start session for questions tests: ${error.message}`)
    const r = data as unknown as { session_id: string; question_ids: string[] }
    sessionId = r.session_id
    sessionQuestionIds = r.question_ids
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
  })

  it('returns type-discriminated rows for all three question types in the session', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<{
      id: string
      question_type: string
      options: unknown
      dialog_template: string | null
      blanks_safe: unknown
      canonical_answer?: unknown
      accepted_synonyms?: unknown
      blanks_config?: unknown
    }>
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(25)

    const saRow = rows.find((r) => r.id === saId)
    const dfRow = rows.find((r) => r.id === dfId)
    const mcRow = rows.find((r) => r.id === mcId)

    expect(saRow?.question_type).toBe('short_answer')
    expect(dfRow?.question_type).toBe('dialog_fill')
    expect(mcRow?.question_type).toBe('multiple_choice')
  })

  it("returns rows in the session's frozen question order", async () => {
    // The frozen config.question_ids order is the part structure the exam UI
    // renders (P1 → P2 → P3) — the RPC must preserve it, not re-shuffle.
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<{ id: string }>
    expect(rows.map((r) => r.id)).toEqual(sessionQuestionIds)
  })

  it('strips canonical_answer and accepted_synonyms from short_answer rows', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<Record<string, unknown>>
    const row = rows.find((r) => r['id'] === saId)
    expect(row).toBeDefined()
    // These keys must be absent from the returned row entirely
    expect('canonical_answer' in row!).toBe(false)
    expect('accepted_synonyms' in row!).toBe(false)
    // options is NULL for short_answer
    expect(row!['options']).toBeNull()
  })

  it('rewrites dialog_fill tokens from {{n|canonical;syn}} to {{n}} and strips blanks_config canonicals', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<Record<string, unknown>>
    const dfRow = rows.find((r) => r['id'] === dfId)
    expect(dfRow).toBeDefined()

    // dialog_template must have {{n}} plain markers, NOT {{n|canonical;...}} tokens
    const tpl = dfRow!['dialog_template'] as string
    expect(tpl).toContain('{{0}}')
    expect(tpl).not.toContain('S5-ABC')
    expect(tpl).not.toContain('S5-XYZ')
    expect(tpl).not.toMatch(/\{\{\d+\|/)

    // blanks_safe contains only index, not canonical or synonyms
    const blanksSafe = dfRow!['blanks_safe'] as Array<Record<string, unknown>>
    expect(Array.isArray(blanksSafe)).toBe(true)
    expect(blanksSafe).toHaveLength(1)
    const blank = blanksSafe[0]!
    expect('index' in blank).toBe(true)
    expect('canonical' in blank).toBe(false)
    expect('synonyms' in blank).toBe(false)

    // blanks_config must not be in the response at all
    expect('blanks_config' in dfRow!).toBe(false)
    expect(JSON.stringify(dfRow)).not.toContain('S5-ABC')
  })

  it('returns MC options stripped of the correct flag', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<Record<string, unknown>>
    const mcRow = rows.find((r) => r['id'] === mcId)
    expect(mcRow).toBeDefined()
    const opts = mcRow!['options'] as Array<Record<string, unknown>>
    expect(Array.isArray(opts)).toBe(true)
    // Every returned option object must only have 'id' and 'text' — no 'correct'
    for (const opt of opts) {
      expect(Object.keys(opt).sort()).toEqual(['id', 'text'])
      expect('correct' in opt).toBe(false)
    }
  })

  it('omits explanation_text and explanation_image_url from every returned row', async () => {
    // #833 contract change: explanations moved to get_vfr_rt_exam_results (the
    // post-completion reveal) — the in-exam read must not carry them at all.
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<Record<string, unknown>>
    expect(rows).toHaveLength(25)
    for (const row of rows) {
      expect('explanation_text' in row).toBe(false)
      expect('explanation_image_url' in row).toBe(false)
    }
    // Value-level guard: the seeded explanation strings ('SA explanation N',
    // 'DF explanation N', 'MC explanation N') must not appear under ANY key.
    const serialized = JSON.stringify(rows)
    expect(serialized).not.toContain('SA explanation')
    expect(serialized).not.toContain('DF explanation')
    expect(serialized).not.toContain('MC explanation')
  })

  it('returns the same stripped rows for a completed session', async () => {
    // #833 contract: the results page re-fetches questions after submit, so the
    // RPC accepts sessions with ended_at set — there is no in-flight requirement.
    // Insert the completed session directly: ended_at IS NOT NULL keeps it out of
    // the active-session partial unique index, so it coexists with the main
    // in-flight session.
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'vfr_rt_exam',
        subject_id: rtSubjectId,
        config: { question_ids: [saId, dfId, mcId] },
        total_questions: 3,
        correct_count: 0,
        score_percentage: 0,
        passed: false,
        ended_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`completed session insert: ${insErr.message}`)
    const completedSessionId = inserted.id as string

    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: completedSessionId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<Record<string, unknown>>
    expect(rows).toHaveLength(3)
    // The frozen question order holds on the completed path too
    expect(rows.map((r) => r['id'])).toEqual([saId, dfId, mcId])
    // Answer-key and explanation stripping still applies post-completion
    for (const row of rows) {
      expect('canonical_answer' in row).toBe(false)
      expect('accepted_synonyms' in row).toBe(false)
      expect('explanation_text' in row).toBe(false)
      expect('explanation_image_url' in row).toBe(false)
    }
    const mcRow = rows.find((r) => r['id'] === mcId)
    expect(mcRow).toBeDefined()
    const opts = mcRow!['options'] as Array<Record<string, unknown>>
    for (const opt of opts) {
      expect('correct' in opt).toBe(false)
    }
  })

  it('still returns a question soft-deleted after the session started', async () => {
    // §15 carve-out (docs/security.md §15; docs/database.md §3 "Scoring
    // Soft-Deleted Questions"): config.question_ids is write-once at session
    // start, so an in-flight exam keeps rendering a question retired mid-exam.
    // saIds[7] is not asserted by any other test in this block.
    const carveOutId = saIds[7]!
    const { data: softDeleted, error: sdErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', carveOutId)
      .select('id')
    if (sdErr) throw new Error(`carve-out soft-delete setup: ${sdErr.message}`)
    expect(softDeleted).toHaveLength(1)

    try {
      const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
        p_session_id: sessionId,
      })
      expect(error).toBeNull()
      const rows = data as unknown as Array<{ id: string }>
      expect(rows).toHaveLength(25)
      expect(rows.map((r) => r.id)).toContain(carveOutId)
    } finally {
      // Restore so later tests see the seeded state. console.error, not throw:
      // a throw here would mask the test's own assertion failure (biome
      // noUnsafeFinally).
      const { data: restored, error: restoreErr } = await admin
        .from('questions')
        .update({ deleted_at: null })
        .eq('id', carveOutId)
        .select('id')
      if (restoreErr) {
        console.error('[carve-out restore] question left soft-deleted:', restoreErr.message)
      } else if ((restored?.length ?? 0) === 0) {
        console.error(
          '[carve-out restore] zero rows restored — question left soft-deleted:',
          carveOutId,
        )
      }
    }
  })

  it("rejects another student's session id with the guard error", async () => {
    // Replaces the pre-#833 mixed-array cross-org test: arbitrary question ids
    // can no longer be passed, so isolation is enforced at the session gate.
    // Non-vacuous: the second student's session genuinely exists and is readable
    // by its owner — only the cross-owner call must raise.
    const studentId2 = await createTestUser({
      admin,
      orgId,
      email: `student-rtqs2-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId2)
    const client2 = await getAuthenticatedClient({
      email: `student-rtqs2-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const { data: startData, error: startErr } = await client2.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rtSubjectId,
    })
    expect(startErr).toBeNull()
    const foreignSessionId = (startData as unknown as { session_id: string }).session_id
    expect(foreignSessionId).toBeTruthy()

    // Positive control: the owner can read their own session's questions.
    const { data: ownData, error: ownErr } = await client2.rpc('get_vfr_rt_exam_questions', {
      p_session_id: foreignSessionId,
    })
    expect(ownErr).toBeNull()
    expect(ownData as unknown as unknown[]).toHaveLength(25)

    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: foreignSessionId,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found or not owned')
  })

  it('rejects a non-vfr_rt_exam session with the guard error', async () => {
    // Owned by the caller, completed, not deleted — the ONLY failing guard
    // predicate is the mode check.
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        subject_id: rtSubjectId,
        config: { question_ids: [mcId] },
        total_questions: 1,
        correct_count: 0,
        score_percentage: 0,
        passed: false,
        ended_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`quick_quiz session insert: ${insErr.message}`)
    const quickSessionId = inserted.id as string
    expect(quickSessionId).toBeTruthy()

    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: quickSessionId,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found or not owned')
  })

  it('rejects a soft-deleted vfr_rt_exam session with the guard error', async () => {
    // Owned, right mode, completed (so it never collides with the active-session
    // partial unique index) — the ONLY failing guard predicate is deleted_at.
    // The row demonstrably exists (insert returned its id), so the raise is
    // non-vacuous.
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'vfr_rt_exam',
        subject_id: rtSubjectId,
        config: { question_ids: [saId, dfId, mcId] },
        total_questions: 3,
        correct_count: 0,
        score_percentage: 0,
        passed: false,
        ended_at: new Date().toISOString(),
        deleted_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`soft-deleted session insert: ${insErr.message}`)
    const deletedSessionId = inserted.id as string
    expect(deletedSessionId).toBeTruthy()

    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: deletedSessionId,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found or not owned')
  })

  it('rejects a nonexistent session id with the guard error', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: '00000000-0000-4000-a000-000000000833',
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('Session not found or not owned')
  })

  it('filters foreign-org questions out of a session whose frozen config references them', async () => {
    // Mig 105 defense-in-depth (issue #831): the questions JOIN filters
    // q.organization_id = v_caller_org_id. The session gate cannot catch this
    // case — the session is genuinely owned by the caller — so if a frozen
    // config.question_ids ever references a foreign-org question, only the org
    // filter keeps it out of the response.
    const foreignOrgId = await createTestOrg({
      admin,
      name: `RT Foreign Org ${suffix}`,
      slug: `rt-foreign-${suffix}`,
    })
    let foreignAdminId: string | null = null
    let foreignQuestionId: string | null = null
    try {
      foreignAdminId = await createTestUser({
        admin,
        orgId: foreignOrgId,
        email: `admin-rtforeign-${suffix}@test.local`,
        password: 'test-pass-123',
        role: 'admin',
      })
      const foreignBankId = await ensureBank(foreignOrgId, foreignAdminId)
      // easa_subjects/easa_topics are GLOBAL tables — the foreign-org question
      // can share the seeded RT subject/topic refs.
      foreignQuestionId = await insertShortAnswerQuestion({
        orgId: foreignOrgId,
        bankId: foreignBankId,
        adminId: foreignAdminId,
        rtSubjectId,
        p1TopicId,
        idx: 400,
      })

      // Non-vacuous: the foreign question demonstrably exists (and belongs to
      // the foreign org) before the call — "1 row" below proves filtering, not
      // a missing fixture.
      const { data: foreignRow, error: foreignErr } = await admin
        .from('questions')
        .select('id, organization_id')
        .eq('id', foreignQuestionId)
        .single()
      expect(foreignErr).toBeNull()
      expect(foreignRow?.organization_id).toBe(foreignOrgId)

      // Caller-owned, right mode, not deleted, valid question_ids array (so the
      // mig 105 session_config_malformed guard passes). ended_at is set so the
      // row stays off the active-session partial unique index — the RPC accepts
      // completed sessions.
      const { data: inserted, error: insErr } = await admin
        .from('quiz_sessions')
        .insert({
          organization_id: orgId,
          student_id: studentId,
          mode: 'vfr_rt_exam',
          subject_id: rtSubjectId,
          config: { question_ids: [saId, foreignQuestionId], parts: [] },
          total_questions: 2,
          correct_count: 0,
          score_percentage: 0,
          passed: false,
          ended_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insErr) throw new Error(`mixed-org session insert: ${insErr.message}`)
      const mixedSessionId = inserted.id as string
      expect(mixedSessionId).toBeTruthy()

      const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
        p_session_id: mixedSessionId,
      })
      expect(error).toBeNull()
      const rows = data as unknown as Array<{ id: string }>
      expect(rows).toHaveLength(1)
      expect(rows[0]!.id).toBe(saId)
      expect(rows.map((r) => r.id)).not.toContain(foreignQuestionId)
      // The mixed session itself is org-scoped to this describe's org, so
      // afterAll's cleanupTestData removes it — same as the other
      // admin-inserted-session tests in this block.
    } finally {
      // Foreign-org rows are OUTSIDE afterAll's org scope — remove them here in
      // FK-safe order (question → bank → user → org → auth user). console.error,
      // not throw: a throw here would mask the test's own assertion failure
      // (biome noUnsafeFinally).
      if (foreignQuestionId) {
        const { data: deletedQ, error: qErr } = await admin
          .from('questions')
          .delete()
          .eq('id', foreignQuestionId)
          .select('id')
        if (qErr) {
          console.error('[foreign-org cleanup] question delete failed:', qErr.message)
        } else if ((deletedQ?.length ?? 0) === 0) {
          console.error('[foreign-org cleanup] zero questions deleted:', foreignQuestionId)
        }
      }
      // Zero rows is valid for the bank (ensureBank may not have run) — log only
      // when something was actually removed.
      const { data: deletedBanks, error: bankErr } = await admin
        .from('question_banks')
        .delete()
        .eq('organization_id', foreignOrgId)
        .select('id')
      if (bankErr) {
        console.error('[foreign-org cleanup] bank delete failed:', bankErr.message)
      } else if ((deletedBanks?.length ?? 0) > 0) {
        console.log(`[foreign-org cleanup] removed ${deletedBanks?.length} bank(s)`)
      }
      if (foreignAdminId) {
        const { data: deletedUsers, error: userErr } = await admin
          .from('users')
          .delete()
          .eq('id', foreignAdminId)
          .select('id')
        if (userErr) {
          console.error('[foreign-org cleanup] user delete failed:', userErr.message)
        } else if ((deletedUsers?.length ?? 0) === 0) {
          console.error('[foreign-org cleanup] zero users deleted:', foreignAdminId)
        }
      }
      const { data: deletedOrgs, error: orgErr } = await admin
        .from('organizations')
        .delete()
        .eq('id', foreignOrgId)
        .select('id')
      if (orgErr) {
        console.error('[foreign-org cleanup] org delete failed:', orgErr.message)
      } else if ((deletedOrgs?.length ?? 0) === 0) {
        console.error('[foreign-org cleanup] zero orgs deleted:', foreignOrgId)
      }
      if (foreignAdminId) {
        const { error: authErr } = await admin.auth.admin.deleteUser(foreignAdminId)
        if (authErr) {
          console.error('[foreign-org cleanup] auth user delete failed:', authErr.message)
        }
      }
    }
  })

  it('rejects an unauthenticated call with not_authenticated', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const anonClient = createClient(
      process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
      process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { error } = await anonClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_authenticated')
  })

  it('rejects a soft-deleted caller with user_not_found_or_inactive', async () => {
    // Soft-delete the student — the deleted_at-filtered SELECT INTO yields NULL,
    // triggering the user_not_found_or_inactive gate (mig 099b family pattern).
    const { error: softDeleteErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId)
    if (softDeleteErr) throw new Error(`soft-delete setup: ${softDeleteErr.message}`)

    try {
      const { error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
        p_session_id: sessionId,
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('user_not_found_or_inactive')
    } finally {
      // Restore the student so afterAll cleanup can delete the row cleanly.
      const { error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', studentId)
      // console.error, not throw: a throw here would mask the test's own
      // assertion failure (biome noUnsafeFinally).
      if (restoreErr) {
        console.error('[soft-delete restore] student row left soft-deleted:', restoreErr.message)
      }
    }
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
