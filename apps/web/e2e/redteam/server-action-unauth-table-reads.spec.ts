/**
 * Red Team Spec: Unauthenticated Direct Table SELECT Vectors
 *
 * Exercises the subset of Vectors B+E that read tables directly (not via RPC)
 * using an unauthenticated anon-key client (no JWT). Every table's RLS must
 * return 0 rows or an error; no victim data may leak.
 *
 * Split from server-action-unauthenticated.spec.ts to stay within the 500-line
 * cap (code-style.md §1). RPC vectors remain in the original file.
 * Status: Expected to PASS (anon key + RLS should block everything).
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { cleanupFixtures } from './helpers/cleanup'
import { seedUnauthFixtures } from './helpers/seed-unauth-fixtures'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Unauthenticated client — anon key only, no sign-in, no JWT
const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

test.describe('Red Team: Unauthenticated Direct Table SELECT Access', () => {
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let victimUserId: string
  let knownSubjectId: string
  let knownQuestionId: string
  let knownVictimSessionId: string

  // Fixture tracker returned by seedUnauthFixtures; passed to afterAll cleanup.
  let tracker: Awaited<ReturnType<typeof seedUnauthFixtures>>['tracker']

  test.beforeAll(async () => {
    adminClient = getAdminClient()
    const fixtures = await seedUnauthFixtures(adminClient)
    victimUserId = fixtures.victimUserId
    knownSubjectId = fixtures.knownSubjectId
    knownQuestionId = fixtures.knownQuestionId
    knownVictimSessionId = fixtures.knownVictimSessionId
    tracker = fixtures.tracker
  })

  // --- Direct table SELECT vectors ---

  test('unauthenticated client sees 0 rows from student_responses', async () => {
    // Non-vacuous (code-style.md §7): confirm the victim's responses exist via the
    // admin client before the anon probe — a 0-row anon result proves RLS is blocking,
    // not that the table is empty.
    const { data: adminRows, error: adminErr } = await adminClient
      .from('student_responses')
      .select('id')
      .eq('student_id', victimUserId)
      .limit(1)
    expect(adminErr).toBeNull()
    expect((adminRows ?? []).length).toBeGreaterThan(0)

    const { data, error } = await unauthClient.from('student_responses').select('*').limit(10)
    expect(error).toBeNull() // RLS returns empty, not an error
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from quiz_sessions', async () => {
    // Non-vacuous: confirm the victim's seeded session exists via the admin client.
    const { data: adminRows, error: adminErr } = await adminClient
      .from('quiz_sessions')
      .select('id')
      .eq('id', knownVictimSessionId)
      .is('deleted_at', null)
      .limit(1)
    expect(adminErr).toBeNull()
    expect((adminRows ?? []).length).toBeGreaterThan(0)

    const { data, error } = await unauthClient.from('quiz_sessions').select('*').limit(10)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from users', async () => {
    // Non-vacuous: confirm the victim user exists via the admin client.
    const { data: adminRows, error: adminErr } = await adminClient
      .from('users')
      .select('id')
      .eq('id', victimUserId)
      .is('deleted_at', null)
      .limit(1)
    expect(adminErr).toBeNull()
    expect((adminRows ?? []).length).toBeGreaterThan(0)

    const { data, error } = await unauthClient.from('users').select('id, email').limit(10)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from questions (correct answers must not leak)', async () => {
    // Non-vacuous: confirm the known question exists via the admin client.
    const { data: adminRows, error: adminErr } = await adminClient
      .from('questions')
      .select('id')
      .eq('id', knownQuestionId)
      .is('deleted_at', null)
      .limit(1)
    expect(adminErr).toBeNull()
    expect((adminRows ?? []).length).toBeGreaterThan(0)

    const { data, error } = await unauthClient.from('questions').select('*').limit(10)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from quiz_session_answers', async () => {
    // Non-vacuous: confirm the victim session's answers exist via the admin client.
    const { data: adminRows, error: adminErr } = await adminClient
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', knownVictimSessionId)
      .limit(1)
    expect(adminErr).toBeNull()
    expect((adminRows ?? []).length).toBeGreaterThan(0)

    const { data, error } = await unauthClient.from('quiz_session_answers').select('*').limit(10)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('unauthenticated client sees 0 rows from audit_events', async () => {
    // Non-vacuous: confirm audit rows for the victim session exist via the admin client.
    const { data: adminRows, error: adminErr } = await adminClient
      .from('audit_events')
      .select('id')
      .eq('actor_id', victimUserId)
      .eq('resource_id', knownVictimSessionId)
      .limit(1)
    expect(adminErr).toBeNull()
    expect((adminRows ?? []).length).toBeGreaterThan(0)

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
