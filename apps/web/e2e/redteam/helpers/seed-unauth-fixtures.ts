/**
 * Shared seeding helper for the unauthenticated red-team specs.
 *
 * Each caller invokes `seedUnauthFixtures` in its own `beforeAll`. Each
 * invocation creates independent fixture rows and returns its own `tracker`
 * for `afterAll` cleanup via `cleanupFixtures`. Derive the current callers:
 *   git grep -n 'seedUnauthFixtures' -- apps/web/e2e/redteam
 *
 * ONE row is shared rather than per-invocation: the `flagged_questions`
 * upsert keys on `(student_id, question_id)`, so every invocation targets the
 * same row and one caller's `cleanupFixtures` soft-deletes it for the other.
 * Safe only while the `redteam` project runs serially — `workers: 1` and
 * `fullyParallel: false` in `apps/web/playwright.config.ts`. Before enabling
 * parallel execution, give each invocation its own question.
 */

import type { getAdminClient } from '../../helpers/supabase'
import { cleanupFixtures, createFixtureTracker, type FixtureTracker } from './cleanup'
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
  /** A real session id used as a plausible attack input. Falls back to
   *  `knownVictimSessionId` when the DB carries no pre-existing session. */
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
 * Seed the fixtures needed by the unauthenticated red-team specs and return
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
  const { knownSessionId, knownQuestionId } = await lookupSeedIds(adminClient, seed.orgId)

  const knownVictimSessionId = await seedTrackedRows(
    adminClient,
    { ...picked, orgId: seed.orgId, victimUserId, knownQuestionId },
    tracker,
  )

  return {
    orgId: seed.orgId,
    victimUserId,
    knownSubjectId: picked.subjectId,
    knownTopicId: picked.topicId,
    // A clean DB has no pre-existing session — fall back, never invent an id.
    knownSessionId: knownSessionId ?? knownVictimSessionId,
    knownQuestionId,
    knownVictimSessionId,
    tracker,
  }
}

/**
 * Seed every TRACKED row behind one failure boundary. The caller receives
 * `tracker` only once this resolves, so a throw part-way leaves seeded rows
 * with nothing able to clean them — clean them here before rethrowing.
 */
async function seedTrackedRows(
  adminClient: AdminClient,
  ids: {
    victimUserId: string
    knownQuestionId: string
    orgId: string
    subjectId: string
    topicId: string
  },
  tracker: FixtureTracker,
): Promise<string> {
  try {
    await seedVictimOwnedRows(adminClient, ids, tracker)
    return await seedVictimCompletedSession(adminClient, ids, tracker)
  } catch (e) {
    try {
      await cleanupFixtures(adminClient, tracker)
    } catch (cleanupErr) {
      // Logged, never rethrown — it must not mask the seeding failure.
      const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
      console.error(`[unauth seed] cleanup after failed seed: ${msg}`)
    }
    throw e
  }
}

/**
 * Resolve an existing session id (a plausible attack input, not seeded here) and
 * the question every victim-owned fixture row below attaches to.
 */
async function lookupSeedIds(
  adminClient: AdminClient,
  orgId: string,
): Promise<{ knownSessionId: string | undefined; knownQuestionId: string }> {
  const { data: sessions, error: sessionsErr } = await adminClient
    .from('quiz_sessions')
    .select('id')
    .limit(1)
  if (sessionsErr) throw new Error(`beforeAll: quiz_sessions lookup failed: ${sessionsErr.message}`)

  // Same status/deleted_at filters as fetchActiveQuestionIds, but org-wide — this id only
  // has to EXIST for the comment/flag rows to attach to. A soft-deleted or inactive pick
  // fails the `.is('deleted_at', null)` control in server-action-unauth-table-reads.spec.ts.
  const { data: questions, error: questionsErr } = await adminClient
    .from('questions')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(1)
  if (questionsErr) throw new Error(`beforeAll: questions lookup failed: ${questionsErr.message}`)
  const knownQuestionId = questions?.[0]?.id
  if (!knownQuestionId) throw new Error('unauth seed: no active question found')

  return {
    knownSessionId: sessions?.[0]?.id,
    knownQuestionId,
  }
}

/**
 * Seed victim-owned rows so the anon SELECT tests prove RLS blocks EXISTING data
 * rather than mere table emptiness. Self-contained — no dependence on another
 * spec's seeding or execution order. Cleaned up in afterAll via `tracker`
 * (soft-delete keeps the rows queryable by id/PK for teardown).
 */
async function seedVictimOwnedRows(
  adminClient: AdminClient,
  ids: { victimUserId: string; knownQuestionId: string },
  tracker: FixtureTracker,
): Promise<void> {
  const { victimUserId, knownQuestionId } = ids
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
}
