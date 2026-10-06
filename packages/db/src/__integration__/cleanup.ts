import type { SupabaseClient } from '@supabase/supabase-js'

export type ReferenceIds = { subjectId: string; topicId: string; subtopicId: string | null }

/**
 * Soft-delete every ACTIVE (`ended_at IS NULL AND deleted_at IS NULL`) quiz_sessions
 * row for the given scope. Call from a per-test `beforeEach` so every test starts with
 * a clean slate under the single-active-session invariant (#1011): the partial unique
 * index `uq_one_active_session_per_student` allows at most one active session per student,
 * and every start RPC raises `another_session_active` on a second. Suites that reuse one
 * test student across many tests and only clean up in `afterAll` otherwise accumulate
 * active sessions, so the 2nd+ `start_quiz_session` call fails (or a direct exam-mode
 * INSERT hits the index). SOFT-delete (UPDATE deleted_at), not hard: the index only counts
 * rows where `deleted_at IS NULL`, so soft-deleting frees the slot while leaving the row
 * for `afterAll` cleanupTestData() to hard-remove.
 *
 * Scope: pass `studentIds` to clear only the REUSED student(s) — preferred when a suite has
 * more than one student in the org and a broad org-wide clear would wrongly wipe a second
 * student's intentionally-active session. Pass `orgId` to clear every test user in a
 * throwaway-org suite. At least one of the two must be provided. Undefined ids are skipped:
 * vitest runs afterAll after a failed beforeAll, leaving them unassigned.
 */
export async function clearActiveSessions(opts: {
  admin: SupabaseClient
  orgId?: string
  studentIds?: Array<string | undefined>
}): Promise<void> {
  const { admin, orgId } = opts
  const studentIds = opts.studentIds?.filter((id): id is string => id != null)
  if (!orgId && !opts.studentIds?.length) {
    throw new Error('clearActiveSessions: provide orgId or a non-empty studentIds')
  }
  if (opts.studentIds?.length && studentIds?.length === 0) return
  let query = admin
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .is('ended_at', null)
    .is('deleted_at', null)
  if (orgId) query = query.eq('organization_id', orgId)
  if (studentIds && studentIds.length > 0) query = query.in('student_id', studentIds)
  const { data, error } = await query.select('id')
  if (error) throw new Error(`clearActiveSessions: ${error.message}`)
  if ((data?.length ?? 0) > 0) {
    console.log(`[clearActiveSessions] soft-deleted ${data?.length} active session(s)`)
  }
}

/**
 * Await a teardown DELETE and log (not throw) on error. Best-effort: one table's failure
 * must not abort the rest of cleanup, and a silent error would leave orphaned test data
 * with no signal (code-style.md §5 — destructure and check `{ error }`).
 */
async function deleteOrLog(
  label: string,
  query: PromiseLike<{ error: { message: string } | null }>,
) {
  const { error } = await query
  if (error) console.error(`cleanupTestData: ${label} delete failed: ${error.message}`)
}

/**
 * Clean up all test data created during a test run.
 * Deletes in reverse FK order using the service role client. Best-effort: per-table errors
 * are logged and skipped (see deleteOrLog) rather than thrown, so one failure doesn't leave
 * the rest of teardown un-run. (cleanupReferenceData throws instead, because it deletes a
 * specific seeded id set where a failure is a real signal, not best-effort cleanup.)
 * An undefined orgId or user id is skipped: vitest runs afterAll after a failed beforeAll,
 * leaving them unassigned.
 *
 * HARD-DELETE IS INTENTIONAL HERE — do not "soft-delete" this teardown. These are ephemeral
 * per-suite fixtures (a throwaway org + its users) that must be physically removed so the next
 * run starts from a clean slate; a soft-delete (deleted_at) would leave rows that pollute later
 * runs' counts and queries, breaking isolation. The immutable-table rule (no UPDATE/DELETE on
 * audit_events / student_responses / quiz_session_answers) and the soft-delete-only rule govern
 * the PRODUCTION app via RLS — they are not enforced for service-role integration teardown, which
 * is the sanctioned mechanism for resetting fixtures (see docs/database.md §3 Soft Delete —
 * hard-delete-by-design exception, and code-style.md §7 "Exception — hard-delete-by-design tables").
 */
export async function cleanupTestData(opts: {
  admin: SupabaseClient
  orgId: string | undefined
  userIds: Array<string | undefined>
}) {
  const { admin, orgId } = opts
  const ids = opts.userIds.filter((id): id is string => id != null)

  if (ids.length > 0) {
    await deleteOrLog('fsrs_cards', admin.from('fsrs_cards').delete().in('student_id', ids))
  }
  const lookupError = orgId ? await deleteOrgFixtures(admin, orgId) : null
  if (ids.length > 0) await deleteOrLog('users', admin.from('users').delete().in('id', ids))
  if (orgId) {
    await deleteOrLog('organizations', admin.from('organizations').delete().eq('id', orgId))
  }

  // Delete auth users (best-effort, same log-don't-throw policy as the table deletes)
  for (const uid of ids) {
    await deleteOrLog(`auth user ${uid}`, admin.auth.admin.deleteUser(uid))
  }
  if (lookupError) throw new Error(`cleanupTestData: quiz_sessions lookup failed: ${lookupError}`)
}

/** Org-scoped fixture rows, in FK-safe order. Returns the session-lookup error, if any. */
async function deleteOrgFixtures(admin: SupabaseClient, orgId: string): Promise<string | null> {
  await deleteOrLog(
    'audit_events',
    admin.from('audit_events').delete().eq('organization_id', orgId),
  )
  await deleteOrLog(
    'student_responses',
    admin.from('student_responses').delete().eq('organization_id', orgId),
  )
  const lookupError = await deleteSessionRows(admin, orgId)
  await deleteOrLog('questions', admin.from('questions').delete().eq('organization_id', orgId))
  await deleteOrLog(
    'question_banks',
    admin.from('question_banks').delete().eq('organization_id', orgId),
  )
  await deleteOrLog(
    'exam_configs',
    admin.from('exam_configs').delete().eq('organization_id', orgId),
  )
  return lookupError
}

/** Session answers, then sessions. Skips both and returns the message when the id lookup fails. */
async function deleteSessionRows(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data: sessionIds, error: sessionIdsErr } = await admin
    .from('quiz_sessions')
    .select('id')
    .eq('organization_id', orgId)
  if (sessionIdsErr) {
    console.error(`cleanupTestData: quiz_sessions lookup failed: ${sessionIdsErr.message}`)
    return sessionIdsErr.message
  }
  await deleteOrLog(
    'quiz_session_answers',
    admin
      .from('quiz_session_answers')
      .delete()
      .in('session_id', sessionIds?.map((s: { id: string }) => s.id) ?? []),
  )
  await deleteOrLog(
    'quiz_sessions',
    admin.from('quiz_sessions').delete().eq('organization_id', orgId),
  )
  return null
}

/**
 * Delete reference rows seeded by seedReferenceData(). easa_subjects/topics/subtopics
 * are GLOBAL tables (not org-scoped), so they're cleaned per-suite (not per-org).
 * Idempotent: dedups ids and .in() no-ops on already-removed rows. Null subtopicIds
 * are skipped (suites that seed no subtopic pass subtopicId: null).
 *
 * Accepts `undefined` ref entries and filters them out: a describe-scoped `let refs`
 * is `undefined` until beforeAll assigns it, and vitest still runs afterAll if beforeAll
 * throws. Filtering here (vs an `if (refs)` guard per call site) also covers the
 * multi-ref start-session case where an early seed succeeds but a later one throws
 * (e.g. [refs, undefined, undefined]) — a single call-site guard would miss that.
 */
export async function cleanupReferenceData(opts: {
  admin: SupabaseClient
  refs: Array<ReferenceIds | undefined>
}) {
  const { admin } = opts
  const refs = opts.refs.filter((r): r is ReferenceIds => r != null)
  const subtopicIds = [
    ...new Set(refs.map((r) => r.subtopicId).filter((v): v is string => v !== null)),
  ]
  const topicIds = [...new Set(refs.map((r) => r.topicId))]
  const subjectIds = [...new Set(refs.map((r) => r.subjectId))]

  // FK-safe order: subtopics → topics → subjects (array order is load-bearing). All test
  // rows that FK into easa_* (questions.{subject_id,topic_id,subtopic_id},
  // quiz_sessions.subject_id, any exam_configs) are already removed by cleanupTestData,
  // which every caller runs first. Sequential await preserves the delete order.
  const targets: Array<{ table: string; label: string; ids: string[] }> = [
    { table: 'easa_subtopics', label: 'subtopics', ids: subtopicIds },
    { table: 'easa_topics', label: 'topics', ids: topicIds },
    { table: 'easa_subjects', label: 'subjects', ids: subjectIds },
  ]
  for (const { table, label, ids } of targets) {
    if (ids.length === 0) continue
    // Chain .select('id') per code-style.md §5: zero rows is a valid steady state, so only
    // log when rows actually changed — surfaces a filter/ID regression that would no-op.
    const { data: deleted, error } = await admin.from(table).delete().in('id', ids).select('id')
    if (error) throw new Error(`cleanupReferenceData ${label}: ${error.message}`)
    if ((deleted?.length ?? 0) > 0) {
      console.log(`[cleanupReferenceData] removed ${deleted?.length} ${table}`)
    }
  }
}
