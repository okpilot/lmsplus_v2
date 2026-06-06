import type { SupabaseClient } from '@supabase/supabase-js'

export type ReferenceIds = { subjectId: string; topicId: string; subtopicId: string | null }

/**
 * Clean up all test data created during a test run.
 * Deletes in reverse FK order using the service role client.
 */
export async function cleanupTestData(opts: {
  admin: SupabaseClient
  orgId: string
  userIds: string[]
}) {
  const { admin, orgId, userIds } = opts

  // Delete in FK-safe order
  await admin.from('audit_events').delete().eq('organization_id', orgId)
  await admin.from('fsrs_cards').delete().in('student_id', userIds)
  await admin.from('student_responses').delete().eq('organization_id', orgId)
  const { data: sessionIds, error: sessionIdsErr } = await admin
    .from('quiz_sessions')
    .select('id')
    .eq('organization_id', orgId)
  if (sessionIdsErr) throw new Error(`cleanupTestData: quiz_sessions lookup failed: ${sessionIdsErr.message}`)
  await admin
    .from('quiz_session_answers')
    .delete()
    .in(
      'session_id',
      sessionIds?.map((s: { id: string }) => s.id) ?? [],
    )
  await admin.from('quiz_sessions').delete().eq('organization_id', orgId)
  await admin.from('questions').delete().eq('organization_id', orgId)
  await admin.from('question_banks').delete().eq('organization_id', orgId)
  await admin.from('users').delete().in('id', userIds)
  await admin.from('organizations').delete().eq('id', orgId)

  // Delete auth users
  for (const uid of userIds) {
    await admin.auth.admin.deleteUser(uid)
  }
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
  const subtopicIds = [...new Set(refs.map((r) => r.subtopicId).filter((v): v is string => v !== null))]
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
