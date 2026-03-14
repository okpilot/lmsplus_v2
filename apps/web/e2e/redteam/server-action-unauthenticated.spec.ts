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

  test.beforeAll(async () => {
    adminClient = getAdminClient()

    // Resolve real IDs to use as attack inputs — these represent data an
    // attacker might enumerate from leaked IDs or guessing UUIDs.
    const { data: subjects } = await adminClient.from('easa_subjects').select('id').limit(1)
    knownSubjectId = subjects?.[0]?.id ?? '00000000-0000-0000-0000-000000000000'

    const { data: topics } = await adminClient
      .from('easa_topics')
      .select('id')
      .eq('subject_id', knownSubjectId)
      .limit(1)
    knownTopicId = topics?.[0]?.id ?? '00000000-0000-0000-0000-000000000003'

    const { data: sessions } = await adminClient.from('quiz_sessions').select('id').limit(1)
    knownSessionId = sessions?.[0]?.id ?? '00000000-0000-0000-0000-000000000001'

    const { data: questions } = await adminClient.from('questions').select('id').limit(1)
    knownQuestionId = questions?.[0]?.id ?? '00000000-0000-0000-0000-000000000002'
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
      p_selected_option: '00000000-0000-0000-0000-000000000099',
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
})
