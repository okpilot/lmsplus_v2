/**
 * Shared seeding helper for the unauthenticated red-team specs.
 *
 * Both `server-action-unauthenticated.spec.ts` (RPC vectors + BJ) and
 * `server-action-unauth-table-reads.spec.ts` (Direct table SELECT vectors)
 * call `seedUnauthFixtures` in their own `beforeAll`. Each invocation
 * creates independent fixture rows and returns its own `tracker` for
 * `afterAll` cleanup via `cleanupFixtures`.
 *
 * ONE row is shared rather than per-invocation: the `flagged_questions`
 * upsert keys on `(student_id, question_id)`, so every invocation targets the
 * same row and one caller's `cleanupFixtures` soft-deletes it for the other.
 * Safe only while the `redteam` project runs serially — `workers: 1` and
 * `fullyParallel: false` in `apps/web/playwright.config.ts`. Before enabling
 * parallel execution, give each invocation its own question.
 */

import type { getAdminClient } from '../../helpers/supabase'
import { createFixtureTracker, type FixtureTracker } from './cleanup'
import { E2E_REDTEAM_UNAUTH_COMMENT_MARKER } from './seed-markers'
import { pickSubjectWithQuestions } from './seed-quiz'
import { seedRedTeamUsers } from './seed-users'
import { seedVictimCompletedSession } from './seed-victim-session'

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

  // Same filters as fetchActiveQuestionIds: the question_comments insert and the
  // flagged_questions upsert below attach victim rows to this id, and
  // server-action-unauth-table-reads.spec.ts re-reads it with `.is('deleted_at', null)`
  // as its non-vacuity control — a soft-deleted or inactive pick fails that control.
  const { data: questions, error: questionsErr } = await adminClient
    .from('questions')
    .select('id')
    .eq('organization_id', seed.orgId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(1)
  if (questionsErr) throw new Error(`beforeAll: questions lookup failed: ${questionsErr.message}`)
  const knownQuestionId = questions?.[0]?.id
  if (!knownQuestionId) throw new Error('unauth seed: no active question found')

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

  const knownVictimSessionId = await seedVictimCompletedSession(
    adminClient,
    { orgId: seed.orgId, subjectId: knownSubjectId, topicId: knownTopicId },
    tracker,
  )

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
