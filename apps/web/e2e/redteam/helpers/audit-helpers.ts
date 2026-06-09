/**
 * Shared helper functions for audit-completeness and audit-auth-events specs.
 *
 * All functions accept their dependencies (admin client, ids, etc.) as explicit
 * parameters rather than closing over describe-scoped vars, so they can be
 * imported by any spec without capturing stale state.
 */

import { expect } from '@playwright/test'
import type { getAdminClient } from '../../helpers/supabase'
import type { createAuthenticatedClient } from './redteam-client'

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

/**
 * Build an answers array for a given session by reading config.question_ids
 * and fetching each question's first option via the service-role client.
 */
export async function buildAnswersForSession(
  admin: AdminClient,
  sessionId: string,
): Promise<unknown[]> {
  const { data: session, error: sErr } = await admin
    .from('quiz_sessions')
    .select('config')
    .eq('id', sessionId)
    .single()
  if (sErr || !session) throw new Error(`buildAnswers session: ${sErr?.message}`)
  const rawIds = (session.config as { question_ids?: unknown })?.question_ids
  if (!Array.isArray(rawIds)) {
    throw new Error(`buildAnswers: config.question_ids is not an array: ${JSON.stringify(rawIds)}`)
  }
  const ids = rawIds.filter((v): v is string => typeof v === 'string')
  if (ids.length === 0) throw new Error('buildAnswers: session has no question_ids')

  // Service role can read full questions including options for grading shape.
  const { data: questions, error: qErr } = await admin
    .from('questions')
    .select('id, options')
    .in('id', ids)
  if (qErr || !questions) throw new Error(`buildAnswers questions: ${qErr?.message}`)
  if (!Array.isArray(questions)) {
    throw new Error(`buildAnswers: unexpected questions shape: ${JSON.stringify(questions)}`)
  }
  return questions.map((raw) => {
    const q = raw as unknown as { id: unknown; options: unknown }
    if (typeof q.id !== 'string') {
      throw new Error(`buildAnswers: unexpected question id shape: ${JSON.stringify(q.id)}`)
    }
    if (!Array.isArray(q.options)) {
      throw new Error(`buildAnswers: question ${q.id} options is not an array`)
    }
    const firstOpt = q.options[0] as { id?: unknown } | undefined
    const optionId = typeof firstOpt?.id === 'string' ? firstOpt.id : undefined
    if (!optionId) {
      throw new Error(`buildAnswers: question ${q.id} has no options`)
    }
    return {
      question_id: q.id,
      selected_option: optionId,
      response_time_ms: 1500,
    }
  })
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
 * the next batch_submit_quiz or complete_empty_exam_session call.
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
 * Issue an internal exam code via the RPC as the given admin-authenticated client,
 * add the code id to `createdCodeIds`, and return `{ codeId, code }`.
 */
export async function issueCodeViaRpc(
  adminAuthedClient: Awaited<ReturnType<typeof createAuthenticatedClient>>,
  subjectId: string,
  studentUserId: string,
  createdCodeIds: Set<string>,
): Promise<{ codeId: string; code: string }> {
  const { data, error } = await adminAuthedClient.rpc('issue_internal_exam_code', {
    p_subject_id: subjectId,
    p_student_id: studentUserId,
  })
  expect(error, 'issue_internal_exam_code error').toBeNull()
  if (!Array.isArray(data)) {
    throw new Error(`issueCodeViaRpc: unexpected RPC return shape: ${JSON.stringify(data)}`)
  }
  const row = data[0] as { code_id: string; code: string } | undefined
  expect(row, 'issue_internal_exam_code returned empty').toBeTruthy()
  if (!row) throw new Error('unreachable')
  createdCodeIds.add(row.code_id)
  return { codeId: row.code_id, code: row.code }
}
