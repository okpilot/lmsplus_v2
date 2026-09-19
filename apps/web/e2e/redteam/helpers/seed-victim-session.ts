/**
 * Victim quiz-flow seeding for the unauthenticated red-team specs.
 *
 * Split out of seed-unauth-fixtures.ts to keep both files under the
 * utility/helper cap in .claude/limits.json.
 */

import type { getAdminClient } from '../../helpers/supabase'
import { buildAnswersForSession, fetchActiveQuestionIds } from './audit-helpers'
import type { FixtureTracker } from './cleanup'
import { createAuthenticatedClient } from './redteam-client'
import { VICTIM_EMAIL, VICTIM_PASSWORD } from './seed-users'

type AdminClient = ReturnType<typeof getAdminClient>
type RpcResult = { data: unknown; error: { message: string } | null }

/**
 * Seed a completed quick_quiz flow for the victim so quiz_sessions,
 * quiz_session_answers, student_responses and audit_events are non-empty on a
 * clean DB (all four are empty after `supabase db reset` + seed-e2e.ts).
 *
 * The session is tracked in `tracker.sessions` and soft-deleted in afterAll.
 * quiz_session_answers, student_responses and audit_events are append-only
 * (docs/security.md §5/§6) and left permanently — matching the precedent in
 * seed-responses.ts: "Rows are inserted once and left permanently."
 */
export async function seedVictimCompletedSession(
  adminClient: AdminClient,
  ids: { orgId: string; subjectId: string; topicId: string },
  tracker: FixtureTracker,
): Promise<string> {
  const victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
  const seedSessionId = await startVictimSession(adminClient, victimClient, ids)
  tracker.sessions.add(seedSessionId)

  try {
    const seedAnswers = await buildAnswersForSession(adminClient, seedSessionId)
    const { error: submitErr } = await victimClient.rpc('batch_submit_quiz', {
      p_session_id: seedSessionId,
      p_answers: seedAnswers,
    })
    if (submitErr) throw new Error(`unauth seed: batch_submit_quiz failed: ${submitErr.message}`)
  } catch (e) {
    // The session is open (`ended_at IS NULL`) and the caller never receives the
    // tracker, so afterAll cannot clean it. The single-active-session guard
    // (docs/security.md §11d) would then raise `another_session_active` on every
    // later run. Soft-delete clears the guard's `deleted_at IS NULL` term.
    try {
      await discardSeedSession(adminClient, seedSessionId)
    } catch (discardErr) {
      // Both failures matter: the submit failure explains the seed, the discard
      // failure explains why `another_session_active` will fire on the next run.
      // `message` stays the submit failure's so callers can still match on it.
      throw new AggregateError([e, discardErr], e instanceof Error ? e.message : String(e))
    }
    throw e
  }
  return seedSessionId
}

/** Start the victim's quick_quiz session and return its id, guarding the RPC's untyped return. */
async function startVictimSession(
  adminClient: AdminClient,
  victimClient: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult> },
  ids: { orgId: string; subjectId: string; topicId: string },
): Promise<string> {
  const seedQuestionIds = await fetchActiveQuestionIds(adminClient, {
    orgId: ids.orgId,
    subjectId: ids.subjectId,
    topicId: ids.topicId,
    limit: 1,
  })
  const { data: seedSessionId, error: startErr } = await victimClient.rpc('start_quiz_session', {
    p_mode: 'quick_quiz',
    p_subject_id: ids.subjectId,
    p_topic_id: ids.topicId,
    p_question_ids: seedQuestionIds,
  })
  if (startErr || !seedSessionId || typeof seedSessionId !== 'string') {
    throw new Error(
      `unauth seed: start_quiz_session failed: ${startErr?.message ?? 'non-string id'}`,
    )
  }
  return seedSessionId
}

/** Soft-delete a half-seeded session. Throws on failure; the caller composes both errors. */
async function discardSeedSession(adminClient: AdminClient, sessionId: string): Promise<void> {
  const { data, error } = await adminClient
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('deleted_at', null)
    .select('id')
  if (error) {
    throw new Error(`unauth seed: failed to discard session ${sessionId}: ${error.message}`)
  }
  if ((data?.length ?? 0) > 0) {
    console.log(`[unauth seed] discarded ${data?.length} half-seeded session(s)`)
  }
}
