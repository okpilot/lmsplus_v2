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
import { cleanupFixtures, type FixtureTracker } from './helpers/cleanup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedUnauthFixtures } from './helpers/seed-unauth-fixtures'
import { VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
// mig 20260925000400 revokes EXECUTE on every public function from PUBLIC and
// anon, so every RPC call below is rejected at the privilege layer (42501)
// BEFORE the function body ever runs — never reaching a body-raised
// 'not authenticated' / 'not_authenticated' message.
const FUNCTION_PERMISSION_DENIED = /permission denied for function/i

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

  // Fixture tracker returned by seedUnauthFixtures; passed to afterAll cleanup.
  let tracker: FixtureTracker

  test.beforeAll(async () => {
    adminClient = getAdminClient()
    const fixtures = await seedUnauthFixtures(adminClient)
    victimUserId = fixtures.victimUserId
    knownSubjectId = fixtures.knownSubjectId
    knownTopicId = fixtures.knownTopicId
    knownSessionId = fixtures.knownSessionId
    knownQuestionId = fixtures.knownQuestionId
    tracker = fixtures.tracker
  })

  // --- RPC vectors ---

  test('unauthenticated client cannot call start_quiz_session', async () => {
    const { data, error } = await unauthClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: knownSubjectId,
      p_topic_id: knownTopicId,
      p_question_ids: [knownQuestionId],
    })

    // mig 20260925000400 revokes anon EXECUTE on every public function, so the
    // call is rejected at the privilege layer before the body ever runs.
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data).toBeNull()
  })

  test('unauthenticated client cannot call submit_quiz_answer', async () => {
    const { data, error } = await unauthClient.rpc('submit_quiz_answer', {
      p_session_id: knownSessionId,
      p_question_id: knownQuestionId,
      p_selected_option: '00000000-0000-4000-a000-000000000099',
      p_response_time_ms: 1000,
    })

    // mig 20260925000400 revokes anon EXECUTE on every public function, so the
    // call is rejected at the privilege layer (42501) before the body's
    // `RAISE EXCEPTION 'not authenticated'` (P0001) is ever reached.
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data).toBeNull()
  })

  test('unauthenticated client cannot call get_quiz_questions', async () => {
    const { data, error } = await unauthClient.rpc('get_quiz_questions', {
      p_question_ids: [knownQuestionId],
    })

    // mig 20260925000400 revokes anon EXECUTE on every public function, so the
    // call is rejected at the privilege layer before correct answers could ever
    // be built or returned.
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data).toBeNull()
  })

  test('list_my_active_internal_exam_codes rejects unauthenticated callers (Vector BW)', async () => {
    // mig 20260925000400 revokes anon EXECUTE, so the call is rejected at the
    // privilege layer before the auth.uid() IS NULL guard, or any data access,
    // is ever reached.
    const { data, error } = await unauthClient.rpc('list_my_active_internal_exam_codes')
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('list_my_internal_exam_history rejects unauthenticated callers (Vector BX)', async () => {
    // Same privilege-layer denial as list_my_active_internal_exam_codes —
    // anonymous callers must not enumerate any student's session history.
    const { data, error } = await unauthClient.rpc('list_my_internal_exam_history')
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_daily_activity rejects unauthenticated callers', async () => {
    // Both analytics RPCs gained the active-user gate in mig 20260824000300, but
    // mig 20260925000400 revokes anon EXECUTE, so the call is rejected before
    // that gate — or the older auth.uid() IS NULL check — is ever reached.
    // p_student_id is a required arg; a random uuid is fine, the call never runs.
    const { data, error } = await unauthClient.rpc('get_daily_activity', {
      p_student_id: '00000000-0000-0000-0000-000000000000',
      p_days: 7,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_subject_scores rejects unauthenticated callers', async () => {
    // Sibling of the above. MEASURED 2026-09-01: get_subject_scores's only in-repo caller was
    // the getSubjectScores helper (apps/web/lib/queries/analytics.ts), which nothing imported —
    // so no page reached it and its GRANT to `authenticated` is now the only live surface, since
    // mig 20260925000400 revokes anon EXECUTE. Callers are an OPEN set; re-derive with
    // `grep -rn "get_subject_scores\|getSubjectScores" apps packages` rather than trusting this line.
    const { data, error } = await unauthClient.rpc('get_subject_scores', {
      p_student_id: '00000000-0000-0000-0000-000000000000',
      p_limit: 5,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('record_internal_exam_code_emailed rejects unauthenticated callers (Vector DZ)', async () => {
    // mig 20260925000400 revokes anon EXECUTE, so the call is rejected at the
    // privilege layer before the auth.uid() IS NULL guard (mig 110) or any code
    // lookup is ever reached — a non-existent uuid is therefore fine.
    const { data, error } = await unauthClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: '00000000-0000-4000-a000-000000000003',
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_student_mastery_stats is denied for an unauthenticated caller', async () => {
    // BW1
    const { data, error } = await unauthClient.rpc('get_student_mastery_stats')
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_question_counts is denied for an unauthenticated caller', async () => {
    // CA: named param required.
    const { data, error } = await unauthClient.rpc('get_question_counts', { p_status: 'active' })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_student_last_practiced is denied for an unauthenticated caller', async () => {
    // BX2
    const { data, error } = await unauthClient.rpc('get_student_last_practiced')
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_student_streak is denied for an unauthenticated caller', async () => {
    // BX1: previously a scalar-subquery shape returned one zeroed row even for
    // anon; the users read behind it is now denied before that row is built.
    const { data, error } = await unauthClient.rpc('get_student_streak')
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('start_exam_session rejects unauthenticated callers (Vector AG, #545)', async () => {
    // SECURITY DEFINER; mig 20260925000400 revokes anon EXECUTE, so the call is
    // rejected at the privilege layer before the auth.uid() IS NULL guard, or any
    // exam_config lookup, is ever reached. knownSubjectId is a REAL subject (so
    // the rejection is the privilege guard, not a missing-subject path).
    const { data, error } = await unauthClient.rpc('start_exam_session', {
      p_subject_id: knownSubjectId,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('complete_empty_exam_session rejects unauthenticated callers (Vector AN, #557)', async () => {
    // SECURITY DEFINER; mig 20260925000400 revokes anon EXECUTE, so the call is
    // rejected at the privilege layer before the auth.uid() IS NULL guard, or the
    // session ownership lookup, is ever reached — the session id need not exist.
    const { data, error } = await unauthClient.rpc('complete_empty_exam_session', {
      p_session_id: knownSessionId,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('start_vfr_rt_exam_session rejects unauthenticated callers (Vector DN1, #825)', async () => {
    // SECURITY DEFINER; mig 20260925000400 revokes anon EXECUTE, so the call is
    // rejected at the privilege layer before the auth.uid() IS NULL guard (mig
    // 099), or the exam_config lookup, is ever reached. knownSubjectId is REAL so
    // the rejection is the privilege guard, not a missing-subject path.
    const { data, error } = await unauthClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: knownSubjectId,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_vfr_rt_exam_questions rejects unauthenticated callers (Vector DO1, #825)', async () => {
    // SECURITY DEFINER; mig 20260925000400 revokes anon EXECUTE, so the call is
    // rejected at the privilege layer before the auth.uid() IS NULL guard (mig
    // 105), or the session/questions read, is ever reached — the session id
    // need not exist.
    const { data, error } = await unauthClient.rpc('get_vfr_rt_exam_questions', {
      p_session_id: knownSessionId,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('submit_vfr_rt_exam_answers rejects unauthenticated callers (Vector DQ1, #825)', async () => {
    // SECURITY DEFINER; mig 20260925000400 revokes anon EXECUTE, so the call is
    // rejected at the privilege layer before the auth.uid() IS NULL guard (mig
    // 100), the session-ownership SELECT, or payload validation, is ever reached.
    const { data, error } = await unauthClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: knownSessionId,
      p_answers: [{ question_id: knownQuestionId, selected_option_id: 'a' }],
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_vfr_rt_exam_results rejects unauthenticated callers (Vector DR1, #825)', async () => {
    // SECURITY DEFINER; mig 20260925000400 revokes anon EXECUTE, so the call is
    // rejected at the privilege layer before the auth.uid() IS NULL guard (mig
    // 103/106), or the ended_at-gated results read, is ever reached — so answer
    // keys are never reachable by an anon caller.
    const { data, error } = await unauthClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: knownSessionId,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('check_non_mc_answer rejects unauthenticated callers (Vector EM, #983)', async () => {
    // SECURITY DEFINER (mig 119); mig 20260925000400 revokes anon EXECUTE, so
    // the call is rejected at the privilege layer before the auth.uid() IS NULL
    // guard, the active-caller gate, the session-ownership SELECT, or any
    // answer-key column read, is ever reached. So a real-looking session id
    // need not exist, and the short_answer/dialog_fill canonicals are never
    // reachable anon.
    const { data, error } = await unauthClient.rpc('check_non_mc_answer', {
      p_question_id: knownQuestionId,
      p_session_id: knownSessionId,
      p_response_text: 'cleared to land',
      p_blank_answers: null,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_question_authoring_fields rejects unauthenticated callers (Vector DT, #825)', async () => {
    // SECURITY DEFINER; mig 20260925000400 revokes anon EXECUTE, so the call is
    // rejected at the privilege layer before the auth.uid() IS NULL guard (mig
    // 094b), or the is_admin() check, is ever reached — the answer-key columns
    // are never reachable anon.
    const { data, error } = await unauthClient.rpc('get_question_authoring_fields', {
      p_question_id: knownQuestionId,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_random_question_ids is denied for an unauthenticated caller (Vector CA, #689)', async () => {
    // _filtered_question_pool also joins active_flagged_questions.
    const { data, error } = await unauthClient.rpc('get_random_question_ids', {
      p_subject_id: knownSubjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 10,
      p_filters: null,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('rejects an unauthenticated get_study_questions call (#1005)', async () => {
    // startStudy (study.ts) chains get_random_question_ids (anon → 0 ids → short-circuits,
    // already covered above) then get_study_questions; mig 20260925000400 revokes
    // anon EXECUTE, so the call is rejected at the privilege layer before the
    // SECURITY DEFINER answer-key RPC's `auth.uid() IS NULL` guard (mig 20260629000700)
    // is ever reached — no correct_option_id is reachable anon. The Server-Action-shape
    // assertion in #1005's AC is infeasible (can't invoke the Server Action from a
    // red-team spec); this is the durable RPC mirror.
    const { data, error } = await unauthClient.rpc('get_study_questions', {
      p_question_ids: [knownQuestionId],
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_filtered_question_counts is denied for an unauthenticated caller (Vector CA, #689)', async () => {
    // Same SECURITY INVOKER shape as get_random_question_ids above.
    const { data, error } = await unauthClient.rpc('get_filtered_question_counts', {
      p_subject_id: knownSubjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: null,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('check_consent_status rejects unauthenticated callers (Vector W, #384)', async () => {
    // SECURITY DEFINER; mig 20260925000400 revokes anon EXECUTE, so the call is
    // rejected at the privilege layer before the _uid IS NULL guard, or the
    // consent lookup, is ever reached.
    const { data, error } = await unauthClient.rpc('check_consent_status', {
      p_tos_version: 'v1.0',
      p_privacy_version: 'v1.0',
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('record_consent rejects unauthenticated callers (Vector W, #384)', async () => {
    // SECURITY DEFINER; mig 20260925000400 revokes anon EXECUTE, so the call is
    // rejected at the privilege layer before the _uid IS NULL guard, or any
    // user_consents INSERT, is ever reached — an anon caller cannot forge a
    // consent record.
    const { data, error } = await unauthClient.rpc('record_consent', {
      p_document_type: 'terms_of_service',
      p_document_version: 'v1.0',
      p_accepted: true,
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('record_auth_event rejects unauthenticated callers (Vector CQ, #788)', async () => {
    // SECURITY DEFINER (mig 093); mig 20260925000400 revokes anon EXECUTE, so
    // the call is rejected at the privilege layer before the auth.uid() IS NULL
    // guard, the actor lookup, the event-type whitelist, or any audit_events
    // INSERT, is ever reached — an anon caller cannot forge an audit row.
    const { data, error } = await unauthClient.rpc('record_auth_event', {
      p_event_type: 'user.password_changed',
      p_resource_id: '00000000-0000-4000-a000-0000000000aa',
    })
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
  })

  test('get_session_reports rejects unauthenticated callers (Vector CL1, #784)', async () => {
    // SECURITY DEFINER (mig 091); mig 20260925000400 revokes anon EXECUTE, so
    // the call is rejected at the privilege layer before the auth.uid() IS NULL
    // guard, or the session query, is ever reached — so an anon caller gets an
    // error, NOT an empty result set.
    const { data, error } = await unauthClient.rpc('get_session_reports')
    expect(error?.code).toBe('42501')
    expect(error?.message ?? '').toMatch(FUNCTION_PERMISSION_DENIED)
    expect(data ?? null).toBeNull()
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
