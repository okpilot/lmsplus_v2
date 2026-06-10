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
  let saId: string
  let dfId: string
  let mcId: string
  const userIds: string[] = []
  // Cross-org fixture (issue #831): a second org owning a question the
  // first-org student must never be able to read through this RPC.
  let orgId2: string
  let adminUserId2: string
  let crossOrgSaId: string

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
    saId = await insertShortAnswerQuestion({
      orgId,
      bankId,
      adminId: adminUserId,
      rtSubjectId,
      p1TopicId,
      idx: 200,
    })
    dfId = await insertDialogFillQuestion({
      orgId,
      bankId,
      adminId: adminUserId,
      rtSubjectId,
      p2TopicId,
      idx: 200,
    })
    mcId = await insertMcQuestion({
      orgId,
      bankId,
      adminId: adminUserId,
      rtSubjectId,
      p3TopicId,
      idx: 200,
    })

    // Second org + question for the cross-org isolation tests (issue #831).
    orgId2 = await createTestOrg({
      admin,
      name: `RT Questions Org B ${suffix}`,
      slug: `rt-qs-b-${suffix}`,
    })
    adminUserId2 = await createTestUser({
      admin,
      orgId: orgId2,
      email: `admin-rtqsb-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    const bankId2 = await ensureBank(orgId2, adminUserId2)
    crossOrgSaId = await insertShortAnswerQuestion({
      orgId: orgId2,
      bankId: bankId2,
      adminId: adminUserId2,
      rtSubjectId,
      p1TopicId,
      idx: 201,
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: orgId2, userIds: [adminUserId2] })
  })

  it('returns type-discriminated rows for all three question types', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_question_ids: [saId, dfId, mcId],
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
    expect(rows).toHaveLength(3)

    const saRow = rows.find((r) => r.id === saId)
    const dfRow = rows.find((r) => r.id === dfId)
    const mcRow = rows.find((r) => r.id === mcId)

    expect(saRow?.question_type).toBe('short_answer')
    expect(dfRow?.question_type).toBe('dialog_fill')
    expect(mcRow?.question_type).toBe('multiple_choice')
  })

  it('strips canonical_answer and accepted_synonyms from short_answer rows', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_question_ids: [saId],
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    // These keys must be absent from the returned row entirely
    expect('canonical_answer' in row).toBe(false)
    expect('accepted_synonyms' in row).toBe(false)
    // options is NULL for short_answer
    expect(row['options']).toBeNull()
  })

  it('rewrites dialog_fill tokens from {{n|canonical;syn}} to {{n}} and strips blanks_config canonicals', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_question_ids: [dfId],
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<Record<string, unknown>>
    const dfRow = rows.find((r) => r['id'] === dfId)!

    // dialog_template must have {{n}} plain markers, NOT {{n|canonical;...}} tokens
    const tpl = dfRow['dialog_template'] as string
    expect(tpl).toContain('{{0}}')
    expect(tpl).not.toContain('S5-ABC')
    expect(tpl).not.toContain('S5-XYZ')
    expect(tpl).not.toMatch(/\{\{\d+\|/)

    // blanks_safe contains only index, not canonical or synonyms
    const blanksSafe = dfRow['blanks_safe'] as Array<Record<string, unknown>>
    expect(Array.isArray(blanksSafe)).toBe(true)
    expect(blanksSafe).toHaveLength(1)
    const blank = blanksSafe[0]!
    expect('index' in blank).toBe(true)
    expect('canonical' in blank).toBe(false)
    expect('synonyms' in blank).toBe(false)

    // blanks_config must not be in the response at all
    expect('blanks_config' in dfRow).toBe(false)
    expect(JSON.stringify(dfRow)).not.toContain('S5-ABC')
  })

  it('returns MC options stripped of the correct flag', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_question_ids: [mcId],
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<Record<string, unknown>>
    const mcRow = rows.find((r) => r['id'] === mcId)!
    const opts = mcRow['options'] as Array<Record<string, unknown>>
    expect(Array.isArray(opts)).toBe(true)
    // Every returned option object must only have 'id' and 'text' — no 'correct'
    for (const opt of opts) {
      expect(Object.keys(opt).sort()).toEqual(['id', 'text'])
      expect('correct' in opt).toBe(false)
    }
  })

  it('returns only same-org questions when the id array mixes same-org and cross-org ids', async () => {
    // Non-vacuous cross-org isolation (issue #831): the same-org question MUST
    // come back (proves the call works) while the other org's question must not.
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_question_ids: [saId, crossOrgSaId],
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<{ id: string }>
    expect(Array.isArray(rows)).toBe(true)
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(saId)
    expect(ids).not.toContain(crossOrgSaId)
    expect(rows).toHaveLength(1)
  })

  it('returns zero rows when every requested question belongs to another organization', async () => {
    const { data, error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
      p_question_ids: [crossOrgSaId],
    })
    expect(error).toBeNull()
    const rows = data as unknown as unknown[]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(0)
  })

  it('rejects an unauthenticated call with not_authenticated', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const anonClient = createClient(
      process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
      process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { error } = await anonClient.rpc('get_vfr_rt_exam_questions', {
      p_question_ids: [saId],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_authenticated')
  })

  it('rejects a soft-deleted caller with user_not_found_or_inactive', async () => {
    // Soft-delete the student — the deleted_at-filtered SELECT INTO yields NULL,
    // triggering the user_not_found_or_inactive gate (mig 099b pattern).
    const { error: softDeleteErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId)
    if (softDeleteErr) throw new Error(`soft-delete setup: ${softDeleteErr.message}`)

    try {
      const { error } = await studentClient.rpc('get_vfr_rt_exam_questions', {
        p_question_ids: [saId],
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
    // PostgREST maps 42501 to HTTP 403; error.message contains the pg error
    const errMsg = error?.message ?? ''
    const isPermissionError =
      errMsg.includes('42501') ||
      errMsg.toLowerCase().includes('permission denied') ||
      errMsg.toLowerCase().includes('insufficient privilege')
    expect(isPermissionError).toBe(true)
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
