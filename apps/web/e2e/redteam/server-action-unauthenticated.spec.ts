/**
 * Red Team Spec: Unauthenticated RPC and Table Access
 *
 * Vectors B+E (MEDIUM): Server Actions and RPCs called without a valid session.
 * Tested at the Supabase client level (not browser) using an unauthenticated
 * anon-key client — simulating a request with no JWT.
 *
 * All RPCs and protected tables must return errors or empty results.
 * Status: Expected to PASS (anon key + RLS should block everything).
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { pickSubjectWithQuestions, seedRedTeamUsers } from './helpers/seed'

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
  let seededCommentId: string | null = null
  let seededFlagQuestionId: string | null = null

  test.beforeAll(async () => {
    adminClient = getAdminClient()

    // Resolve real IDs to use as attack inputs — these represent data an
    // attacker might enumerate from leaked IDs or guessing UUIDs.
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    const picked = await pickSubjectWithQuestions(adminClient, { orgId: seed.orgId })
    knownSubjectId = picked.subjectId
    knownTopicId = picked.topicId

    const { data: sessions } = await adminClient.from('quiz_sessions').select('id').limit(1)
    knownSessionId = sessions?.[0]?.id ?? '00000000-0000-4000-a000-000000000001'

    const { data: questions } = await adminClient.from('questions').select('id').limit(1)
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
        body: '[E2E_REDTEAM] unauth-read fixture',
      })
      .select('id')
      .single()
    if (commentErr || !comment)
      throw new Error(
        `unauth seed: failed to seed question_comment: ${commentErr?.message ?? 'none'}`,
      )
    seededCommentId = comment.id

    const { error: flagErr } = await adminClient
      .from('flagged_questions')
      .upsert(
        { student_id: victimUserId, question_id: knownQuestionId, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    if (flagErr) throw new Error(`unauth seed: failed to seed flagged_question: ${flagErr.message}`)
    seededFlagQuestionId = knownQuestionId
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

  test('unauthenticated client sees 0 rows from flagged_questions', async () => {
    const { data, error } = await unauthClient.from('flagged_questions').select('*').limit(10)

    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
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

  test.afterAll(async () => {
    // Hermetic cleanup (code-style.md §7): soft-delete the seeded victim fixtures.
    if (seededCommentId) {
      const { data: discarded, error } = await adminClient
        .from('question_comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', seededCommentId)
        .is('deleted_at', null)
        .select('id')
      if (error) {
        console.error(`[unauth cleanup] question_comments soft-delete error: ${error.message}`)
      } else if ((discarded?.length ?? 0) > 0) {
        console.log(`[unauth cleanup] soft-deleted ${discarded?.length} fixture comment(s)`)
      }
    }
    if (seededFlagQuestionId) {
      const { data: discarded, error } = await adminClient
        .from('flagged_questions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', victimUserId)
        .eq('question_id', seededFlagQuestionId)
        .is('deleted_at', null)
        .select('student_id')
      if (error) {
        console.error(`[unauth cleanup] flagged_questions soft-delete error: ${error.message}`)
      } else if ((discarded?.length ?? 0) > 0) {
        console.log(`[unauth cleanup] soft-deleted ${discarded?.length} fixture flag(s)`)
      }
    }
  })
})
