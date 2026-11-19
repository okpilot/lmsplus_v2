/**
 * Shared helper functions for audit-completeness and audit-auth-events specs.
 *
 * All functions accept their dependencies (admin client, ids, etc.) as explicit
 * parameters rather than closing over describe-scoped vars, so they can be
 * imported by any spec without capturing stale state.
 */

import { expect } from '@playwright/test'
import { randomCode } from '../../helpers/code-gen'
import type { getAdminClient } from '../../helpers/supabase'

type AdminClient = ReturnType<typeof getAdminClient>

/**
 * Fetch up to `limit` active, non-deleted question IDs from the given org/subject/topic.
 * Throws with a descriptive message if fewer than `limit` rows exist.
 */
export async function fetchActiveQuestionIds(
  admin: AdminClient,
  opts: { orgId: string; subjectId: string; topicId: string; limit: number },
): Promise<string[]> {
  const { orgId, subjectId, topicId, limit } = opts
  const { data, error } = await admin
    .from('questions')
    .select('id')
    .eq('organization_id', orgId)
    .eq('subject_id', subjectId)
    .eq('topic_id', topicId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`fetchActiveQuestionIds: ${error.message}`)
  if (!data || data.length < limit) {
    throw new Error(`fetchActiveQuestionIds: needed ${limit} questions, got ${data?.length ?? 0}`)
  }
  return data.map((row) => row.id)
}

/** `metadata.reason` of the session's audit event of `eventType` (undefined when absent). */
export async function readAuditReason(
  admin: AdminClient,
  eventType: string,
  sessionId: string,
): Promise<unknown> {
  const { data, error } = await admin
    .from('audit_events')
    .select('metadata')
    .eq('event_type', eventType)
    .eq('resource_id', sessionId)
    .maybeSingle()
  if (error) throw new Error(`readAuditReason ${eventType}: ${error.message}`)
  return (data?.metadata as { reason?: unknown } | null | undefined)?.reason
}

/**
 * Assert that at least one audit_events row exists with the given event_type and actor_id
 * after `testStart`. Optionally scoped to a specific `resourceId`.
 */
export async function expectAuditRow(
  admin: AdminClient,
  eventType: string,
  actorId: string,
  testStart: string,
  resourceId?: string,
): Promise<void> {
  let q = admin
    .from('audit_events')
    .select('id, event_type, actor_id, resource_id, created_at')
    .eq('event_type', eventType)
    .eq('actor_id', actorId)
    .gte('created_at', testStart)
  if (resourceId) q = q.eq('resource_id', resourceId)
  const { data, error } = await q
  expect(error, `audit_events query error for ${eventType}`).toBeNull()
  const where = resourceId ? ` resource ${resourceId}` : ''
  expect(
    data?.length ?? 0,
    `expected at least one ${eventType} audit row for actor ${actorId}${where}`,
  ).toBeGreaterThan(0)
}

/**
 * Assert that the completion audit event for `sessionId` uses the canonical
 * `answered_count`/`correct_count` metadata keys and NOT the legacy `answered`/`correct`
 * keys (#570).
 */
export async function expectCompletionMetadata(
  admin: AdminClient,
  opts: {
    eventType: string
    actorId: string
    testStart: string
    sessionId: string
  },
): Promise<void> {
  const { eventType, actorId, testStart, sessionId } = opts
  const { data, error } = await admin
    .from('audit_events')
    .select('metadata')
    .eq('event_type', eventType)
    .eq('actor_id', actorId)
    .eq('resource_id', sessionId)
    .gte('created_at', testStart)
  expect(error, `${eventType} metadata query error`).toBeNull()
  const meta = (data?.[0]?.metadata ?? {}) as Record<string, unknown>
  expect(meta, `${eventType} metadata should expose answered_count`).toHaveProperty(
    'answered_count',
  )
  expect(meta, `${eventType} metadata should expose correct_count`).toHaveProperty('correct_count')
  expect(meta, `${eventType} metadata must not use the legacy 'answered' key`).not.toHaveProperty(
    'answered',
  )
  expect(meta, `${eventType} metadata must not use the legacy 'correct' key`).not.toHaveProperty(
    'correct',
  )
}

/**
 * Backdate a quiz_session so that it appears past the grace period:
 * 60s time_limit, started 91s ago → triggers the expired audit path on
 * the next finish_quiz_session call.
 * Uses service-role (exempt from the immutable-columns trigger, mig 20260502000001).
 */
export async function backdateSession(admin: AdminClient, sessionId: string): Promise<void> {
  const past = new Date(Date.now() - 91_000).toISOString()
  const { data, error } = await admin
    .from('quiz_sessions')
    .update({ started_at: past, time_limit_seconds: 60 })
    .eq('id', sessionId)
    .select('id')
  if (error) throw new Error(`backdateSession: ${error.message}`)
  if (!data?.length) {
    throw new Error(`backdateSession: no row updated for session ${sessionId}`)
  }
}

/**
 * Insert a sitting-less fixture code (service role), add its id to `createdCodeIds`, and return
 * `{ codeId, code }`. Writes no audit row.
 */
export async function insertFixtureCode(
  admin: AdminClient,
  opts: { orgId: string; subjectId: string; studentId: string; issuedBy: string },
  createdCodeIds: Set<string>,
): Promise<{ codeId: string; code: string }> {
  const code = randomCode()
  const { data, error } = await admin
    .from('internal_exam_codes')
    .insert({
      code,
      subject_id: opts.subjectId,
      student_id: opts.studentId,
      issued_by: opts.issuedBy,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      organization_id: opts.orgId,
    })
    .select('id')
    .single()
  if (error || typeof data?.id !== 'string') {
    throw new Error(`insertFixtureCode: ${error?.message ?? 'no row'}`)
  }
  createdCodeIds.add(data.id)
  return { codeId: data.id, code }
}
