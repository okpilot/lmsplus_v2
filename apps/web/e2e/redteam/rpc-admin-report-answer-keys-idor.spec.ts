/**
 * Red Team Spec: get_admin_report_answer_keys / get_admin_report_correct_options
 * — cross-org admin IDOR (Vector FK, #991 review follow-up)
 *
 * Both are SECURITY DEFINER RPCs that let an org admin read the answer key(s)
 * for a COMPLETED quiz_session — get_admin_report_answer_keys (mig
 * 20260824000100, new this branch) for non-MC question types (short_answer,
 * dialog_fill, ordering, diagram_label) and get_admin_report_correct_options
 * (mig 20260406000005, latest body 20260619000400) for the MC key. Both share
 * an EXECUTABLE-IDENTICAL guard block (verified by diffing both migration bodies:
 * every statement matches; only an explanatory comment differs):
 * auth.uid() null-check -> is_admin() -> org lookup (folded active-user gate
 * via `deleted_at IS NULL`) -> `IF NOT EXISTS (SELECT 1 FROM quiz_sessions
 * WHERE id = p_session_id AND organization_id = v_org_id AND ended_at IS NOT
 * NULL AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Session not found, not
 * in caller org, or not completed'`.
 *
 * COVERAGE GAP THIS SPEC CLOSES: the app-layer integration test for the admin
 * session report asserts cross-org rejection too, but that rejection fires at
 * fetchAdminSessionForReport's OWN `.eq('organization_id', organizationId)`
 * filter BEFORE either RPC is ever invoked — so the RPC's own org guard, a
 * defense-in-depth layer that exists independently of the app-layer filter,
 * was exercised by no test. This spec calls both RPCs DIRECTLY (bypassing the
 * app layer entirely), mirroring how rpc-report-answer-keys.spec.ts (Vector
 * EN) calls get_report_answer_keys directly for the student-owned sibling.
 *
 * Vectors:
 *  - positive control (non-vacuity): the in-org (org-A/egmont) admin reads
 *    the REAL non-MC keys for org-A's own completed session, which is seeded
 *    with one short_answer + one dialog_fill question. This proves the
 *    session carries a genuinely leak-able payload before the attack asserts
 *    nothing leaks — an all-MC session would make get_admin_report_answer_keys
 *    return 0 rows regardless of the org guard, which would be
 *    indistinguishable from a rejection (code-style.md §7).
 *  - positive control (org-B admin identity): the cross-org (org-B) admin
 *    reaches the session-lookup step for a session in ITS OWN org, for BOTH
 *    RPCs — proving the org-B admin's JWT and admin role are genuinely
 *    valid. Without this, the FK1/FK2 rejections below could be passing for
 *    an unrelated reason (invalid token, non-admin caller, or a misspelled
 *    RPC name), not for the org guard actually firing.
 *  - FK1: the org-B admin calls get_admin_report_answer_keys with org-A's
 *    session id (IDOR) -> 'Session not found, not in caller org, or not
 *    completed' (exact RAISE string, mig 20260824000100).
 *  - FK2: the org-B admin calls get_admin_report_correct_options with org-A's
 *    session id (IDOR) -> the same exact RAISE string (mig 20260619000400
 *    L112, executable-identical guard block).
 *
 * Vector FL (#1249, red-team attack-surface matrix): the two guard layers
 * BEFORE the org check — `auth.uid() IS NULL` and `NOT is_admin()` — had no
 * spec reaching them by ROLE. FK's positive controls always authenticate as a
 * genuine admin. The soft-deleted-admin spec (Vector EJ) DOES reach
 * `NOT is_admin()` — that is its primary layer, per its own docblock — but it
 * gets there through the `deleted_at IS NULL` predicate INSIDE is_admin(),
 * never through the `role = 'admin'` half. So a regression that dropped or
 * short-circuited the role half alone would leak MC and non-MC answer keys to
 * ANY authenticated student for ANY completed session in their org, and every
 * pre-existing spec would still have passed. Both new
 * cases target org-A's own fixture session (the genuinely leak-able
 * short_answer + dialog_fill payload from the positive controls above), not
 * org-B's — this is an authn/role gate, not the org-scoping IDOR that FK1/FK2
 * cover, so there is no cross-org element to it.
 *  - FL1/FL2: an unauthenticated (anon-key) caller -> 'Not authenticated'.
 *  - FL3/FL4: a plain student in org-A (the ATTACKER fixture user, same org
 *    as the target session — proving rejection is role-gated, not
 *    org-gated) -> 'forbidden'.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_FK_MARKER } from './helpers/seed-markers'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  createCrossOrgUser,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const ANSWER_KEYS_RPC = 'get_admin_report_answer_keys'
const CORRECT_OPTIONS_RPC = 'get_admin_report_correct_options'
// Exact RAISE string shared byte-for-byte by both RPCs (verified by reading
// both migration bodies — see the file header comment).
const ORG_GUARD_MESSAGE = /session not found, not in caller org, or not completed/i
// FL: the two guard layers before the org check, also shared byte-for-byte
// by both RPCs (`IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not
// authenticated'` / `IF NOT public.is_admin() THEN RAISE EXCEPTION
// 'forbidden'` — read from both migration bodies, same as ORG_GUARD_MESSAGE).
const UNAUTHENTICATED_MESSAGE = /not authenticated/i
const FORBIDDEN_MESSAGE = /forbidden/i

const SHORT_ANSWER_QNUM = `${E2E_REDTEAM_FK_MARKER} short-answer`
const DIALOG_FILL_QNUM = `${E2E_REDTEAM_FK_MARKER} dialog-fill`

// Escape LIKE metacharacters (the marker's '_' chars are single-char wildcards) so the
// pre-sweep + cleanup match the exact [E2E_REDTEAM_FK] prefix, never an FK-shaped row.
// Mirrors the escapeLike helper in app/app/admin/students/queries.ts and
// rpc-report-answer-keys.spec.ts (backslash is Postgres LIKE's default escape char).
const escapeLike = (value: string): string => value.replaceAll(/[%_\\]/g, String.raw`\$&`)
const FK_MARKER_LIKE = `${escapeLike(E2E_REDTEAM_FK_MARKER)}%`

const SHORT_ANSWER_CANONICAL = 'cleared to land'
const DIALOG_BLANK = { index: 0, canonical: 'two seven', synonyms: ['27'] as string[] }

type AnswerKeyRow = {
  question_id: string
  question_type: string
  blank_index: number | null
  answer_key: string | null
}
type CorrectOptionRow = { question_id: string; correct_option_id: string | null }

test.describe('Red Team: get_admin_report_answer_keys / get_admin_report_correct_options — cross-org admin IDOR (Vector FK)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let orgAAdminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgBAdminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgAStudentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgAId: string
  let orgBId: string
  let orgAStudentId: string
  let orgBStudentId: string
  let subjectId: string
  let shortAnswerQuestionId: string
  let dialogFillQuestionId: string
  let orgASessionId: string
  let orgBSessionId: string

  test.beforeAll(async () => {
    admin = getAdminClient()

    // Crash-resilient pre-sweep of orphaned FK fixture questions from a prior aborted run.
    const { data: sweptQ, error: sweepErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .like('question_number', FK_MARKER_LIKE)
      .is('deleted_at', null)
      .select('id')
    if (sweepErr) throw new Error(`FK fixture pre-sweep failed: ${sweepErr.message}`)
    if ((sweptQ?.length ?? 0) > 0) {
      console.log(
        `[admin-report-answer-keys-idor] pre-swept ${sweptQ?.length} orphaned FK fixture question(s)`,
      )
    }

    // Crash-resilient pre-sweep of orphaned FK fixture SESSIONS from a prior aborted run.
    // Sessions carry no queryable question_number marker, so they need their own sweep,
    // keyed on the e2e_marker key seeded into `config` below (code-style.md §7).
    const { data: sweptS, error: sweepSErr } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_FK_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (sweepSErr) throw new Error(`FK fixture session pre-sweep failed: ${sweepSErr.message}`)
    if ((sweptS?.length ?? 0) > 0) {
      console.log(
        `[admin-report-answer-keys-idor] pre-swept ${sweptS?.length} orphaned FK fixture session(s)`,
      )
    }

    const seed = await seedRedTeamUsers()
    orgAId = seed.orgId
    orgAStudentId = seed.victimUserId
    orgBId = seed.otherOrgId

    const orgAAdmin = await seedRedTeamAdmin()
    const orgBAdmin = await seedCrossOrgAdmin()
    orgAAdminClient = await createAuthenticatedClient(orgAAdmin.email, orgAAdmin.password)
    orgBAdminClient = await createAuthenticatedClient(orgBAdmin.email, orgBAdmin.password)

    const orgBStudent = await createCrossOrgUser()
    orgBStudentId = orgBStudent.userId

    // FL3/FL4: a plain (non-admin) student in org-A — the SAME org as the
    // target fixture session — so the rejection below is provably role-gated
    // (is_admin() false), not org-gated (which FK1/FK2 already cover).
    orgAStudentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // Pin the precondition FL3/FL4 actually depend on. is_admin() is
    // `role = 'admin' AND deleted_at IS NULL`, and BOTH halves raise the same
    // 'forbidden' token — so if this fixture were ever left soft-deleted, FL3/FL4
    // would still pass while covering only the deleted_at half that Vector EJ
    // already covers, silently reopening the gap they exist to close. upsertUser
    // deliberately does not reset deleted_at (see seed-core.ts), so nothing
    // restores it once set. Assert it rather than assume it.
    const { data: attackerRow, error: attackerErr } = await admin
      .from('users')
      .select('role, deleted_at')
      .eq('email', ATTACKER_EMAIL)
      .single()
    expect(attackerErr).toBeNull()
    expect(attackerRow?.role).toBe('student')
    expect(attackerRow?.deleted_at).toBeNull()

    // easa_subjects is shared reference data (no organization_id column — see
    // rpc-cross-tenant-reports.spec.ts / seed-quiz.ts), so the same subjectId
    // is a valid FK target for a quiz_sessions row in EITHER org.
    const picked = await pickSubjectWithQuestions(admin, { orgId: orgAId })
    subjectId = picked.subjectId

    // Derive valid FKs (bank_id, topic_id, created_by) from a real active org-A
    // question so the non-MC inserts below satisfy the questions table's NOT
    // NULL FKs without standing up new taxonomy (mirrors
    // rpc-report-answer-keys.spec.ts's beforeAll).
    const { data: fkRow, error: fkErr } = await admin
      .from('questions')
      .select('bank_id, topic_id, created_by')
      .eq('organization_id', orgAId)
      .eq('subject_id', subjectId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (fkErr) throw new Error(`beforeAll: FK lookup failed: ${fkErr.message}`)
    if (!fkRow) throw new Error('beforeAll: no active org-A question to derive FKs from')
    const bankId = fkRow.bank_id as string
    const topicId = fkRow.topic_id as string
    const createdBy = fkRow.created_by as string

    // Insert one short_answer + one dialog_fill question via the service-role
    // client, which bypasses the REVOKE-gated answer-key columns. It does NOT bypass
    // questions_question_type_columns_check (mig 094) — Postgres evaluates a CHECK
    // constraint for every role — so these rows still satisfy it.
    const baseQuestion = {
      organization_id: orgAId,
      bank_id: bankId,
      subject_id: subjectId,
      topic_id: topicId,
      created_by: createdBy,
      question_text: `${E2E_REDTEAM_FK_MARKER} admin-report-answer-keys fixture`,
      explanation_text: 'Red-team FK fixture explanation.',
      difficulty: 'medium' as const,
      status: 'active' as const,
      options: [] as unknown[],
      correct_option_id: null,
    }

    const { data: saRow, error: saErr } = await admin
      .from('questions')
      .insert({
        ...baseQuestion,
        question_number: SHORT_ANSWER_QNUM,
        question_type: 'short_answer',
        canonical_answer: SHORT_ANSWER_CANONICAL,
        accepted_synonyms: [],
        dialog_template: null,
        blanks_config: [],
      })
      .select('id')
      .single()
    if (saErr || !saRow) throw new Error(`beforeAll: short_answer insert: ${saErr?.message}`)
    shortAnswerQuestionId = saRow.id

    const { data: dfRow, error: dfErr } = await admin
      .from('questions')
      .insert({
        ...baseQuestion,
        question_number: DIALOG_FILL_QNUM,
        question_type: 'dialog_fill',
        canonical_answer: null,
        accepted_synonyms: [],
        // {{N|answer;synonym}} placeholders (mig 125 wellformed-template check).
        dialog_template: `Tower: cleared to land, runway {{0|${DIALOG_BLANK.canonical};${DIALOG_BLANK.synonyms[0]}}}.`,
        blanks_config: [DIALOG_BLANK],
      })
      .select('id')
      .single()
    if (dfErr || !dfRow) throw new Error(`beforeAll: dialog_fill insert: ${dfErr?.message}`)
    dialogFillQuestionId = dfRow.id

    // ── Org-A fixture: completed, answered session carrying a REAL leak-able
    // non-MC payload (short_answer + dialog_fill) — the target of the attack.
    const { data: orgASession, error: orgASessionErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgAId,
        student_id: orgAStudentId,
        mode: 'quick_quiz',
        subject_id: subjectId,
        config: {
          question_ids: [shortAnswerQuestionId, dialogFillQuestionId],
          e2e_marker: E2E_REDTEAM_FK_MARKER,
        },
        total_questions: 2,
        started_at: new Date(Date.now() - 60_000).toISOString(),
        ended_at: new Date().toISOString(),
        score_percentage: 0,
        passed: null,
        correct_count: 0,
      })
      .select('id')
      .single()
    if (orgASessionErr || !orgASession)
      throw new Error(`beforeAll: org-A session seed: ${orgASessionErr?.message}`)
    orgASessionId = orgASession.id

    const { error: answersErr } = await admin.from('quiz_session_answers').insert([
      {
        session_id: orgASessionId,
        question_id: shortAnswerQuestionId,
        selected_option_id: null,
        response_text: SHORT_ANSWER_CANONICAL,
        blank_index: null,
        is_correct: true,
        response_time_ms: 5000,
      },
      {
        session_id: orgASessionId,
        question_id: dialogFillQuestionId,
        selected_option_id: null,
        response_text: DIALOG_BLANK.canonical,
        blank_index: DIALOG_BLANK.index,
        is_correct: true,
        response_time_ms: 5000,
      },
    ])
    if (answersErr) throw new Error(`beforeAll: org-A answers seed: ${answersErr.message}`)

    // ── Org-B fixture: a bare completed session in the ATTACKER'S OWN org.
    // No non-MC questions needed here — its only purpose is to prove the
    // org-B admin's own JWT + org resolution reach the session-lookup step.
    const { data: orgBSession, error: orgBSessionErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgBId,
        student_id: orgBStudentId,
        mode: 'quick_quiz',
        subject_id: subjectId,
        config: { question_ids: [], e2e_marker: E2E_REDTEAM_FK_MARKER },
        total_questions: 1,
        started_at: new Date(Date.now() - 60_000).toISOString(),
        ended_at: new Date().toISOString(),
        score_percentage: 0,
        passed: null,
        correct_count: 0,
      })
      .select('id')
      .single()
    if (orgBSessionErr || !orgBSession)
      throw new Error(`beforeAll: org-B session seed: ${orgBSessionErr?.message}`)
    orgBSessionId = orgBSession.id
  })

  test.afterAll(async () => {
    if (!admin) return
    // Two distinct cleanup steps (sessions, fixture questions) — isolate each
    // in its own try/catch and accumulate errors so a failure in one cannot
    // skip the other (code-style.md §7, per-step error accumulator).
    const errors: string[] = []

    try {
      const ids = [orgASessionId, orgBSessionId].filter((id): id is string => Boolean(id))
      if (ids.length > 0) {
        const { data, error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', ids)
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`afterAll soft-delete sessions: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[admin-report-answer-keys-idor] soft-deleted ${data?.length} session(s)`)
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }

    try {
      const { data: deletedQ, error } = await admin
        .from('questions')
        .update({ deleted_at: new Date().toISOString() })
        .like('question_number', FK_MARKER_LIKE)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`afterAll soft-delete fixture questions: ${error.message}`)
      if ((deletedQ?.length ?? 0) > 0) {
        console.log(
          `[admin-report-answer-keys-idor] soft-deleted ${deletedQ?.length} fixture question(s)`,
        )
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('positive control: the org-A admin reads real non-MC answer keys for org-A own completed session', async () => {
    // Non-vacuity for FK1: proves the session carries a genuinely leak-able
    // payload BEFORE the attack asserts nothing leaks. An all-MC session
    // would make get_admin_report_answer_keys return 0 rows regardless of
    // the org guard, which would be indistinguishable from a rejection.
    const { data, error } = await orgAAdminClient.rpc(ANSWER_KEYS_RPC, {
      p_session_id: orgASessionId,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const rows = data as AnswerKeyRow[]

    expect(rows.map((r) => r.question_id).sort()).toEqual(
      [shortAnswerQuestionId, dialogFillQuestionId].sort(),
    )
    const saRow = rows.find((r) => r.question_id === shortAnswerQuestionId)
    expect(saRow?.question_type).toBe('short_answer')
    expect(saRow?.blank_index).toBeNull()
    expect(saRow?.answer_key).toBe(SHORT_ANSWER_CANONICAL)
    const dfRow = rows.find((r) => r.question_id === dialogFillQuestionId)
    expect(dfRow?.question_type).toBe('dialog_fill')
    expect(dfRow?.blank_index).toBe(DIALOG_BLANK.index)
    expect(dfRow?.answer_key).toBe(DIALOG_BLANK.canonical)
  })

  test('positive control: the org-A admin reads correct-option rows for org-A own completed session', async () => {
    // Non-vacuity for FK2: get_admin_report_correct_options returns one row
    // PER ANSWERED QUESTION regardless of type (correct_option_id is null
    // for these non-MC fixtures) — proves the session is genuinely readable
    // via this RPC too, before the attack asserts nothing is returned.
    const { data, error } = await orgAAdminClient.rpc(CORRECT_OPTIONS_RPC, {
      p_session_id: orgASessionId,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    const rows = data as CorrectOptionRow[]
    expect(rows.map((r) => r.question_id).sort()).toEqual(
      [shortAnswerQuestionId, dialogFillQuestionId].sort(),
    )
  })

  test("positive control: the org-B admin's identity and role are valid against org-B's own session", async () => {
    // Proves the org-B admin's JWT and admin role genuinely resolve past
    // auth.uid() / is_admin() / the org lookup and reach the session-lookup
    // step for a session that actually IS in its own org — so the FK1/FK2
    // rejections below cannot be explained by an invalid token, a
    // non-admin caller, or a misspelled RPC name.
    const answerKeys = await orgBAdminClient.rpc(ANSWER_KEYS_RPC, {
      p_session_id: orgBSessionId,
    })
    expect(answerKeys.error).toBeNull()
    expect(Array.isArray(answerKeys.data)).toBe(true)

    const correctOptions = await orgBAdminClient.rpc(CORRECT_OPTIONS_RPC, {
      p_session_id: orgBSessionId,
    })
    expect(correctOptions.error).toBeNull()
    expect(Array.isArray(correctOptions.data)).toBe(true)
  })

  test('FK1: a cross-org admin cannot read non-MC answer keys for a foreign session (IDOR)', async () => {
    const { data, error } = await orgBAdminClient.rpc(ANSWER_KEYS_RPC, {
      p_session_id: orgASessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(ORG_GUARD_MESSAGE)
    expect(data).toBeNull()
  })

  test('FK2: a cross-org admin cannot read correct-option keys for a foreign session (IDOR)', async () => {
    const { data, error } = await orgBAdminClient.rpc(CORRECT_OPTIONS_RPC, {
      p_session_id: orgASessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(ORG_GUARD_MESSAGE)
    expect(data).toBeNull()
  })

  test('FL1: an unauthenticated caller cannot read non-MC answer keys', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc(ANSWER_KEYS_RPC, { p_session_id: orgASessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(UNAUTHENTICATED_MESSAGE)
    expect(data).toBeNull()
  })

  test('FL2: an unauthenticated caller cannot read correct-option keys', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc(CORRECT_OPTIONS_RPC, { p_session_id: orgASessionId })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(UNAUTHENTICATED_MESSAGE)
    expect(data).toBeNull()
  })

  test('FL3: a plain student caller in the same org cannot read non-MC answer keys', async () => {
    const { data, error } = await orgAStudentClient.rpc(ANSWER_KEYS_RPC, {
      p_session_id: orgASessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(FORBIDDEN_MESSAGE)
    expect(data).toBeNull()
  })

  test('FL4: a plain student caller in the same org cannot read correct-option keys', async () => {
    const { data, error } = await orgAStudentClient.rpc(CORRECT_OPTIONS_RPC, {
      p_session_id: orgASessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(FORBIDDEN_MESSAGE)
    expect(data).toBeNull()
  })
})
