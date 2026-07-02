/**
 * Red Team Spec: Unauthenticated RPC and Table Access (Vectors B+E)
 *
 * Server Actions and RPCs called without a valid session, tested at the
 * Supabase client level using an unauthenticated anon-key client (no JWT).
 * All RPCs and protected tables must return errors or empty results.
 * Status: Expected to PASS (anon key + RLS should block everything).
 */

import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  E2E_REDTEAM_UNAUTH_COMMENT_MARKER,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Unauthenticated client — anon key only, no sign-in, no JWT
const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

test.describe('Red Team: Unauthenticated RPC and Table Access', () => {
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let knownSubjectId: string
  let knownTopicId: string
  let knownSessionId: string
  let knownQuestionId: string
  let victimUserId: string

  // Fixture tracker for afterAll cleanup of seeded comment + flag rows.
  const tracker = createFixtureTracker()

  test.beforeAll(async () => {
    adminClient = getAdminClient()

    // Resolve real IDs to use as attack inputs — these represent data an
    // attacker might enumerate from leaked IDs or guessing UUIDs.
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    const picked = await pickSubjectWithQuestions(adminClient, { orgId: seed.orgId })
    knownSubjectId = picked.subjectId
    knownTopicId = picked.topicId

    const { data: sessions, error: sessionsErr } = await adminClient
      .from('quiz_sessions')
      .select('id')
      .limit(1)
    if (sessionsErr)
      throw new Error(`beforeAll: quiz_sessions lookup failed: ${sessionsErr.message}`)
    knownSessionId = sessions?.[0]?.id ?? '00000000-0000-4000-a000-000000000001'

    const { data: questions, error: questionsErr } = await adminClient
      .from('questions')
      .select('id')
      .limit(1)
    if (questionsErr) throw new Error(`beforeAll: questions lookup failed: ${questionsErr.message}`)
    knownQuestionId = questions?.[0]?.id ?? '00000000-0000-4000-a000-000000000002'

    // Seed victim-owned rows so the anon SELECT tests below prove RLS blocks
    // EXISTING data (not mere table emptiness). These are self-contained — they
    // do not rely on any other spec's seeding or execution order. Cleaned up in
    // afterAll. (Soft-delete keeps them queryable by id/PK for teardown.)
    const { data: comment, error: commentErr } = await adminClient
      .from('question_comments')
      .insert({
        question_id: knownQuestionId,
        user_id: victimUserId,
        body: E2E_REDTEAM_UNAUTH_COMMENT_MARKER,
      })
      .select('id')
      .single()
    if (commentErr || !comment)
      throw new Error(
        `unauth seed: failed to seed question_comment: ${commentErr?.message ?? 'none'}`,
      )
    tracker.comments.add(comment.id)

    const { error: flagErr } = await adminClient
      .from('flagged_questions')
      .upsert(
        { student_id: victimUserId, question_id: knownQuestionId, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    if (flagErr) throw new Error(`unauth seed: failed to seed flagged_question: ${flagErr.message}`)
    tracker.flags.add(`${victimUserId}::${knownQuestionId}`)
  })

  // --- RPC vectors ---

  test('unauthenticated client cannot call start_quiz_session', async () => {
    const { data, error } = await unauthClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: knownSubjectId,
      p_topic_id: knownTopicId,
      p_question_ids: [knownQuestionId],
    })

    // Must fail: either an RPC error or no usable session returned
    const hasNoSession =
      error !== null ||
      data === null ||
      (typeof data === 'object' &&
        (data as { question_ids?: unknown[] })?.question_ids?.length === 0)

    expect(hasNoSession).toBe(true)
  })

  test('unauthenticated client cannot call submit_quiz_answer', async () => {
    const { data, error } = await unauthClient.rpc('submit_quiz_answer', {
      p_session_id: knownSessionId,
      p_question_id: knownQuestionId,
      p_selected_option: '00000000-0000-4000-a000-000000000099',
      p_response_time_ms: 1000,
    })

    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  test('unauthenticated client cannot call get_quiz_questions', async () => {
    const { data, error } = await unauthClient.rpc('get_quiz_questions', {
      p_question_ids: [knownQuestionId],
    })

    // Must return an error or empty array — correct answers must never be exposed
    if (error) {
      expect(error).not.toBeNull()
    } else {
      // If the RPC returned something, it must be an empty array
      expect(Array.isArray(data) ? data.length : 0).toBe(0)
    }
  })

  test('list_my_active_internal_exam_codes rejects unauthenticated callers (Vector BW)', async () => {
    // The RPC raises not_authenticated via the auth.uid() IS NULL guard before
    // any data access. An anon-key client has no JWT, so auth.uid() is NULL and
    // the exception fires before the SELECT runs.
    const { data, error } = await unauthClient.rpc('list_my_active_internal_exam_codes')
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('list_my_internal_exam_history rejects unauthenticated callers (Vector BX)', async () => {
    // Same not_authenticated guard as list_my_active_internal_exam_codes —
    // anonymous callers must not enumerate any student's session history.
    const { data, error } = await unauthClient.rpc('list_my_internal_exam_history')
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('record_internal_exam_code_emailed rejects unauthenticated callers (Vector DZ)', async () => {
    // The RPC raises not_authenticated via the auth.uid() IS NULL guard (mig
    // 110) BEFORE any code lookup. An anon-key client has no JWT, so auth.uid()
    // is NULL and the exception fires — a non-existent uuid is therefore fine.
    const { data, error } = await unauthClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: '00000000-0000-4000-a000-000000000003',
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('get_student_mastery_stats returns an empty set for an unauthenticated caller', async () => {
    // BW1: anon-key client has no JWT → RLS scopes to empty; RPC must not raise.
    const { data, error } = await unauthClient.rpc('get_student_mastery_stats')
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : 0).toBe(0)
  })

  test('get_question_counts returns an empty set for an unauthenticated caller', async () => {
    // CA: named param required; anon → RLS returns empty, no error.
    const { data, error } = await unauthClient.rpc('get_question_counts', { p_status: 'active' })
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : 0).toBe(0)
  })

  test('get_student_last_practiced returns an empty set for an unauthenticated caller', async () => {
    // BX2: anon → RLS filters out all student_responses rows; array must be empty.
    const { data, error } = await unauthClient.rpc('get_student_last_practiced')
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : 0).toBe(0)
  })

  test('get_student_streak returns a single zeroed row for an unauthenticated caller', async () => {
    // BX1: this RPC always returns exactly ONE {current_streak, best_streak} row via a
    // scalar-subquery shape — it is NOT empty even for anon. Anon gets {0, 0}.
    const { data, error } = await unauthClient.rpc('get_student_streak')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.current_streak).toBe(0)
    expect(data?.[0]?.best_streak).toBe(0)
  })

  test('start_exam_session rejects unauthenticated callers (Vector AG, #545)', async () => {
    // SECURITY DEFINER; the auth.uid() IS NULL guard raises 'not authenticated'
    // before any exam_config lookup, so an anon caller never reaches the
    // question-selection path. knownSubjectId is a REAL subject (so the rejection
    // is the auth guard, not a missing-subject path).
    const { data, error } = await unauthClient.rpc('start_exam_session', {
      p_subject_id: knownSubjectId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('complete_empty_exam_session rejects unauthenticated callers (Vector AN, #557)', async () => {
    // SECURITY DEFINER; the auth.uid() IS NULL guard fires before the session
    // ownership lookup, so the session id need not exist for the anon caller to
    // be rejected with 'not authenticated'.
    const { data, error } = await unauthClient.rpc('complete_empty_exam_session', {
      p_session_id: knownSessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('start_vfr_rt_exam_session rejects unauthenticated callers (Vector DN1, #825)', async () => {
    // SECURITY DEFINER; the auth.uid() IS NULL guard raises 'not_authenticated'
    // (mig 099) before the exam_config lookup. knownSubjectId is REAL so the
    // rejection is the auth guard, not a missing-subject path.
    const { data, error } = await unauthClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: knownSubjectId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('get_vfr_rt_exam_questions rejects unauthenticated callers (Vector DO1, #825)', async () => {
    // SECURITY DEFINER; the auth.uid() IS NULL guard raises 'not_authenticated'
    // (mig 105 — the session-derived (p_session_id) signature) before the
    // session/questions read, so the session id need not exist.
    const { data, error } = await unauthClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: knownSessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('submit_vfr_rt_exam_answers rejects unauthenticated callers (Vector DQ1, #825)', async () => {
    // SECURITY DEFINER; the auth.uid() IS NULL guard raises 'not_authenticated'
    // (mig 100) before the session-ownership SELECT and payload validation.
    const { data, error } = await unauthClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: knownSessionId,
      p_answers: [{ question_id: knownQuestionId, selected_option_id: 'a' }],
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('get_vfr_rt_exam_results rejects unauthenticated callers (Vector DR1, #825)', async () => {
    // SECURITY DEFINER; the auth.uid() IS NULL guard raises 'not_authenticated'
    // (mig 103/106) before the ended_at-gated results read — so answer keys are
    // never reachable by an anon caller.
    const { data, error } = await unauthClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: knownSessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('check_non_mc_answer rejects unauthenticated callers (Vector EM, #983)', async () => {
    // SECURITY DEFINER (mig 119); the auth.uid() IS NULL guard raises
    // 'not_authenticated' (snake_case, NO space — distinct from the report RPCs'
    // 'Not authenticated') as the very first statement, before the active-caller
    // gate, the session-ownership SELECT, and any answer-key column read. So a
    // real-looking session id need not exist for the anon caller to be rejected,
    // and the short_answer/dialog_fill canonicals are never reachable anon.
    const { data, error } = await unauthClient.rpc('check_non_mc_answer', {
      p_question_id: knownQuestionId,
      p_session_id: knownSessionId,
      p_response_text: 'cleared to land',
      p_blank_answers: null,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('get_question_authoring_fields rejects unauthenticated callers (Vector DT, #825)', async () => {
    // SECURITY DEFINER; the auth.uid() IS NULL guard raises 'not authenticated'
    // (mig 094b — note the SPACE, not the underscore the vfr_rt RPCs use) before
    // the is_admin() check, so the answer-key columns are never reachable anon.
    const { data, error } = await unauthClient.rpc('get_question_authoring_fields', {
      p_question_id: knownQuestionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('get_random_question_ids returns an empty set for an unauthenticated caller (Vector CA, #689)', async () => {
    // SECURITY INVOKER → runs as the anon role. _filtered_question_pool reads
    // questions under tenant_isolation RLS; with auth.uid() NULL the org scope is
    // empty, so a REAL subject with active questions yields 0 ids (proving RLS
    // blocks, not table emptiness). No RAISE on this path — empty set, no error.
    const { data, error } = await unauthClient.rpc('get_random_question_ids', {
      p_subject_id: knownSubjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 10,
      p_filters: null,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : 0).toBe(0)
  })

  test('rejects an unauthenticated get_study_questions call (#1005)', async () => {
    // startStudy (study.ts) chains get_random_question_ids (anon → 0 ids → short-circuits,
    // already covered above) then get_study_questions; this pins the SECURITY DEFINER
    // answer-key RPC's `auth.uid() IS NULL` guard (mig 20260629000700 raises
    // 'Not authenticated') so no correct_option_id is reachable anon. The
    // Server-Action-shape assertion in #1005's AC is infeasible (can't invoke the
    // Server Action from a red-team spec); this is the durable RPC mirror.
    const { data, error } = await unauthClient.rpc('get_study_questions', {
      p_question_ids: [knownQuestionId],
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data).toBeNull()
  })

  test('get_filtered_question_counts returns an empty set for an unauthenticated caller (Vector CA, #689)', async () => {
    // Same SECURITY INVOKER + tenant_isolation empty-set defense as
    // get_random_question_ids — anon enumerates no per-topic counts.
    const { data, error } = await unauthClient.rpc('get_filtered_question_counts', {
      p_subject_id: knownSubjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: null,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : 0).toBe(0)
  })

  test('check_consent_status rejects unauthenticated callers (Vector W, #384)', async () => {
    // SECURITY DEFINER; the _uid IS NULL guard raises 'Not authenticated' before
    // the consent lookup (message capitalised differently from the exam RPCs —
    // matched case-insensitively).
    const { data, error } = await unauthClient.rpc('check_consent_status', {
      p_tos_version: 'v1.0',
      p_privacy_version: 'v1.0',
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('record_consent rejects unauthenticated callers (Vector W, #384)', async () => {
    // SECURITY DEFINER; the _uid IS NULL guard raises 'Not authenticated' before
    // any user_consents INSERT, so an anon caller cannot forge a consent record.
    const { data, error } = await unauthClient.rpc('record_consent', {
      p_document_type: 'terms_of_service',
      p_document_version: 'v1.0',
      p_accepted: true,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('record_auth_event rejects unauthenticated callers (Vector CQ, #788)', async () => {
    // SECURITY DEFINER (mig 093); the auth.uid() IS NULL guard raises
    // 'not authenticated' before the actor lookup, event-type whitelist, or any
    // audit_events INSERT — so an anon caller cannot forge an audit row.
    const { data, error } = await unauthClient.rpc('record_auth_event', {
      p_event_type: 'user.password_changed',
      p_resource_id: '00000000-0000-4000-a000-0000000000aa',
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data ?? null).toBeNull()
  })

  test('get_session_reports rejects unauthenticated callers (Vector CL1, #784)', async () => {
    // SECURITY DEFINER (mig 091); the auth.uid() IS NULL guard raises
    // 'Not authenticated' (capital N) before the session query — so an anon
    // caller gets an error, NOT an empty result set. Matched case-insensitively.
    const { data, error } = await unauthClient.rpc('get_session_reports')
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not authenticated/i)
    expect(data ?? null).toBeNull()
  })

  // --- Direct table SELECT vectors ---

  test('unauthenticated client sees 0 rows from student_responses', async () => {
    const { data, error } = await unauthClient.from('student_responses').select('*').limit(10)

    expect(error).toBeNull() // RLS returns empty, not an error
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from quiz_sessions', async () => {
    const { data, error } = await unauthClient.from('quiz_sessions').select('*').limit(10)

    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from users', async () => {
    const { data, error } = await unauthClient.from('users').select('id, email').limit(10)

    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from questions (correct answers must not leak)', async () => {
    const { data, error } = await unauthClient.from('questions').select('*').limit(10)

    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from quiz_session_answers', async () => {
    const { data, error } = await unauthClient.from('quiz_session_answers').select('*').limit(10)

    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from audit_events', async () => {
    const { data, error } = await unauthClient.from('audit_events').select('*').limit(10)

    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from question_comments', async () => {
    const { data, error } = await unauthClient.from('question_comments').select('*').limit(10)

    expect(error).toBeNull() // RLS returns empty, not an error
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from flagged_questions even when victim data exists (#276 Vector P)', async () => {
    // Non-vacuous (code-style.md §7): first confirm via the admin client that the
    // seeded victim flag row is actually there — otherwise 0 rows for anon could
    // mean the table is simply empty, not that RLS is blocking.
    // RLS policy (mig 044/050): FOR SELECT USING (student_id = auth.uid()).
    // An anon client has auth.uid() = NULL → student_id = NULL is always false → 0 rows.
    const { data: adminRows, error: adminErr } = await adminClient
      .from('flagged_questions')
      .select('student_id')
      .eq('student_id', victimUserId)
      .is('deleted_at', null)
    expect(adminErr).toBeNull()
    // Confirm the seeded row exists (non-vacuity).
    expect((adminRows ?? []).length).toBeGreaterThan(0)

    // Anon client must see 0 rows despite the victim row existing.
    const { data, error } = await unauthClient.from('flagged_questions').select('*').limit(10)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from easa_topics — fetchTopicsWithSubtopics underlying query blocked (#276 Vector S)', async () => {
    // fetchTopicsWithSubtopics Server Action (apps/web/app/app/quiz/actions/lookup.ts)
    // calls requireAuthUser() (redirect guard) then getTopicsWithSubtopics(), which
    // queries easa_topics. RLS policy (mig 001): FOR SELECT USING (auth.uid() IS NOT NULL).
    // An anon client has auth.uid() = NULL → policy false → 0 rows returned.
    //
    // Non-vacuous: first confirm via admin that the subject's topics exist.
    const { data: adminTopics, error: adminTopicsErr } = await adminClient
      .from('easa_topics')
      .select('id')
      .eq('subject_id', knownSubjectId)
      .limit(1)
    expect(adminTopicsErr).toBeNull()
    // Confirm topics exist for the known subject (non-vacuity).
    expect((adminTopics ?? []).length).toBeGreaterThan(0)

    // Anon client must see 0 rows from easa_topics.
    const { data, error } = await unauthClient
      .from('easa_topics')
      .select('id')
      .eq('subject_id', knownSubjectId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(0)
  })

  test('unauthenticated client cannot insert into question_comments', async () => {
    // user_id is a syntactically valid but non-existent user. RLS WITH CHECK
    // (user_id = auth.uid()) fires first (auth.uid() is NULL for anon), so the
    // rejection carries the RLS code 42501 — not a downstream FK violation.
    const { error } = await unauthClient.from('question_comments').insert({
      question_id: knownQuestionId,
      user_id: '00000000-0000-4000-a000-0000000000ff',
      body: 'redteam-unauth-insert',
    })
    expect(error?.code).toBe('42501')
  })

  // --- #603 Vector BJ: soft-deleted user gate ---

  test.describe('soft-deleted user is rejected by quiz RPCs (#603 Vector BJ)', () => {
    // A student whose users.deleted_at is set (soft-deleted) holds a valid JWT.
    // Both start_quiz_session and batch_submit_quiz must reject with
    // 'user not found or inactive' (mig 20260430000010 + mig 20260430000012,
    // confirmed latest in mig 20260521000001 / mig 20260506000001) before reaching
    // any question-selection or answer-submission logic.
    //
    // beforeAll: sign in as victim, then soft-delete them via admin.
    // afterEach: restore deleted_at = null so the victim user is healthy for
    //            other specs (mig 20260430000010: active-user gate requires deleted_at IS NULL).
    let victimAuthClient: SupabaseClient
    let victimSoftDeleted = false

    test.beforeAll(async () => {
      victimAuthClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    })

    test.afterEach(async () => {
      // Restore victim's deleted_at to null after each test so the user stays active.
      if (!victimSoftDeleted) return
      const { data: restored, error: restoreErr } = await adminClient
        .from('users')
        .update({ deleted_at: null })
        .eq('id', victimUserId)
        .select('id')
      if (restoreErr) throw new Error(`[BJ cleanup] restore victim failed: ${restoreErr.message}`)
      if ((restored?.length ?? 0) === 0)
        throw new Error('[BJ cleanup] restore victim affected 0 rows')
      console.log(`[BJ cleanup] restored victim user ${victimUserId}`)
      victimSoftDeleted = false
    })

    test('start_quiz_session rejects a soft-deleted user with user-not-found error', async () => {
      // Soft-delete the victim via admin (simulates account deactivation).
      const { data: deleted, error: delErr } = await adminClient
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', victimUserId)
        .is('deleted_at', null)
        .select('id')
      expect(delErr).toBeNull()
      // Non-vacuous: confirm the update actually changed a row.
      expect((deleted ?? []).length).toBeGreaterThan(0)
      victimSoftDeleted = true

      // JWT is still valid (signInWithPassword succeeded in beforeAll), but the
      // active-user gate in start_quiz_session checks users.deleted_at IS NULL.
      const { data, error } = await victimAuthClient.rpc('start_quiz_session', {
        p_mode: 'quick_quiz',
        p_subject_id: knownSubjectId,
        p_topic_id: knownTopicId,
        p_question_ids: [knownQuestionId],
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toBe('user not found or inactive')
      expect(data ?? null).toBeNull()
    })

    test('batch_submit_quiz rejects a soft-deleted user with user-not-found error', async () => {
      // Soft-delete the victim via admin.
      const { data: deleted, error: delErr } = await adminClient
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', victimUserId)
        .is('deleted_at', null)
        .select('id')
      expect(delErr).toBeNull()
      // Non-vacuous: confirm the update actually changed a row.
      expect((deleted ?? []).length).toBeGreaterThan(0)
      victimSoftDeleted = true

      // Call batch_submit_quiz with a dummy session id. The user gate fires
      // before the session ownership check, so the rejection is
      // 'user not found or inactive' regardless of whether the session exists.
      const { data, error } = await victimAuthClient.rpc('batch_submit_quiz', {
        p_session_id: knownSessionId,
        p_answers: [
          {
            question_id: knownQuestionId,
            selected_option: '00000000-0000-4000-a000-0000000000ff',
            response_time_ms: 1000,
          },
        ],
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toBe('user not found or inactive')
      expect(data ?? null).toBeNull()
    })
  })

  // Hermetic cleanup (code-style.md §7): soft-delete seeded comment + flag rows.
  // Preserve the original swallow-and-log contract — a teardown failure here
  // must not turn a green run into a suite failure (these are low-stakes setup
  // fixtures). The seeding specs that own isolation fixtures keep the stricter
  // throw contract; this anon-probe spec does not.
  test.afterAll(async () => {
    try {
      await cleanupFixtures(adminClient, tracker)
    } catch (e) {
      console.error(`[unauth cleanup] ${e instanceof Error ? e.message : String(e)}`)
    }
  })
})
