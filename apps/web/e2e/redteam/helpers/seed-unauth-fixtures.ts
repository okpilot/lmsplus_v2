/**
 * Shared seeding helper for the unauthenticated red-team specs.
 *
 * Both `server-action-unauthenticated.spec.ts` (RPC vectors + BJ) and
 * `server-action-unauth-table-reads.spec.ts` (Direct table SELECT vectors)
 * call `seedUnauthFixtures` in their own `beforeAll`. Each invocation
 * creates independent fixture rows and returns its own `tracker` for
 * `afterAll` cleanup via `cleanupFixtures`.
 */

import type { getAdminClient } from '../../helpers/supabase'
import { buildAnswersForSession, fetchActiveQuestionIds } from './audit-helpers'
import { createFixtureTracker, type FixtureTracker } from './cleanup'
import { createAuthenticatedClient } from './redteam-client'
import { E2E_REDTEAM_UNAUTH_COMMENT_MARKER } from './seed-markers'
import { pickSubjectWithQuestions } from './seed-quiz'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './seed-users'

type AdminClient = ReturnType<typeof getAdminClient>

export type UnauthFixtures = {
  orgId: string
  victimUserId: string
  knownSubjectId: string
  knownTopicId: string
  /** Existing session id used as a plausible attack input (not seeded here). */
  knownSessionId: string
  knownQuestionId: string
  /**
   * Session started + completed in seedUnauthFixtures to ensure quiz_sessions,
   * quiz_session_answers, student_responses, and audit_events are non-empty
   * on a clean DB (all four are empty after `supabase db reset` + seed-e2e.ts).
   * The session is tracked in `tracker.sessions` and soft-deleted in afterAll.
   * quiz_session_answers, student_responses, and audit_events are append-only
   * (docs/security.md §5/§6) and left permanently — matching the precedent
   * in seed-responses.ts: "Rows are inserted once and left permanently."
   */
  knownVictimSessionId: string
  tracker: FixtureTracker
}

/**
 * Seed the fixtures needed by both unauthenticated red-team specs and return
 * the resolved ids plus a `FixtureTracker` pre-populated with the seeded rows.
 *
 * Callers must call `cleanupFixtures(adminClient, tracker)` in their `afterAll`.
 */
export async function seedUnauthFixtures(adminClient: AdminClient): Promise<UnauthFixtures> {
  const tracker = createFixtureTracker()

  // Resolve real IDs to use as attack inputs — these represent data an
  // attacker might enumerate from leaked IDs or guessing UUIDs.
  const seed = await seedRedTeamUsers()
  const victimUserId = seed.victimUserId
  const picked = await pickSubjectWithQuestions(adminClient, { orgId: seed.orgId })
  const knownSubjectId = picked.subjectId
  const knownTopicId = picked.topicId

  const { data: sessions, error: sessionsErr } = await adminClient
    .from('quiz_sessions')
    .select('id')
    .limit(1)
  if (sessionsErr) throw new Error(`beforeAll: quiz_sessions lookup failed: ${sessionsErr.message}`)
  const knownSessionId = sessions?.[0]?.id ?? '00000000-0000-4000-a000-000000000001'

  const { data: questions, error: questionsErr } = await adminClient
    .from('questions')
    .select('id')
    .limit(1)
  if (questionsErr) throw new Error(`beforeAll: questions lookup failed: ${questionsErr.message}`)
  const knownQuestionId = questions?.[0]?.id ?? '00000000-0000-4000-a000-000000000002'

  // Seed victim-owned rows so the anon SELECT tests prove RLS blocks
  // EXISTING data (not mere table emptiness). These are self-contained — they
  // do not rely on any other spec's seeding or execution order. Cleaned up in
  // afterAll via the returned tracker. (Soft-delete keeps them queryable by
  // id/PK for teardown.)
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

  // Seed a completed quick_quiz victim flow to ensure quiz_sessions,
  // quiz_session_answers, student_responses, and audit_events are non-empty
  // on a clean DB (all four are empty after `supabase db reset` + seed-e2e.ts).
  // The session is tracked in tracker.sessions and soft-deleted in afterAll.
  // quiz_session_answers, student_responses, and audit_events are append-only
  // (docs/security.md §5/§6) and left permanently — matching the precedent
  // in seed-responses.ts: "Rows are inserted once and left permanently."
  const victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
  const seedQuestionIds = await fetchActiveQuestionIds(adminClient, {
    orgId: seed.orgId,
    subjectId: knownSubjectId,
    topicId: knownTopicId,
    limit: 1,
  })
  const { data: seedSessionId, error: startErr } = await victimClient.rpc('start_quiz_session', {
    p_mode: 'quick_quiz',
    p_subject_id: knownSubjectId,
    p_topic_id: knownTopicId,
    p_question_ids: seedQuestionIds,
  })
  if (startErr || !seedSessionId || typeof seedSessionId !== 'string') {
    throw new Error(
      `unauth seed: start_quiz_session failed: ${startErr?.message ?? 'non-string id'}`,
    )
  }
  const knownVictimSessionId = seedSessionId
  tracker.sessions.add(seedSessionId)
  const seedAnswers = await buildAnswersForSession(adminClient, seedSessionId)
  const { error: submitErr } = await victimClient.rpc('batch_submit_quiz', {
    p_session_id: seedSessionId,
    p_answers: seedAnswers,
  })
  if (submitErr) throw new Error(`unauth seed: batch_submit_quiz failed: ${submitErr.message}`)

  return {
    orgId: seed.orgId,
    victimUserId,
    knownSubjectId,
    knownTopicId,
    knownSessionId,
    knownQuestionId,
    knownVictimSessionId,
    tracker,
  }
}
