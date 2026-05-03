/**
 * Red Team Spec — Vector AM (HIGH): quiz_sessions config injection (issue #554)
 *
 * Attack: Student calls `start_exam_session` to obtain an active mock_exam session,
 *         then directly UPDATEs `quiz_sessions.config` (or other write-once columns)
 *         via PostgREST to swap question_ids before submitting answers. Without DB
 *         column-immutability, batch_submit_quiz would score the student against the
 *         substituted set.
 *
 * Defense: Migration 079 installs `trg_quiz_sessions_immutable_columns`, a
 *          BEFORE UPDATE OF trigger that raises `Cannot modify <col> ... immutable`
 *          for non-service-role connections on:
 *            config, total_questions, mode, time_limit_seconds, started_at,
 *            organization_id, student_id, subject_id, topic_id, created_at
 *
 * Mutable columns remain: ended_at, correct_count, score_percentage, passed,
 * deleted_at — covering every legitimate SECURITY DEFINER UPDATE path.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  ensureExamConfig,
  seedRedTeamUsers,
} from './helpers/seed'

test.describe('Vector AM — quiz_sessions config injection (issue #554)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgId: string
  let subjectId: string
  let sessionId: string
  let originalQuestionIds: string[]

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // Resolve a subject + topic in the seeded org and ensure an exam_config exists
    // so start_exam_session reaches its question-selection / session-create path.
    const { data: subjects } = await admin.from('easa_subjects').select('id').limit(1)
    if (!subjects || subjects.length === 0) {
      throw new Error('seed: no easa_subjects rows available for red-team setup')
    }
    subjectId = subjects[0]!.id

    const { data: topics } = await admin
      .from('easa_topics')
      .select('id')
      .eq('subject_id', subjectId)
      .limit(1)
    const topicId = topics?.[0]?.id
    if (!topicId) {
      throw new Error(
        `seed: no easa_topics row for subject ${subjectId} — red-team fixtures need at least one topic`,
      )
    }

    await ensureExamConfig(orgId, subjectId, topicId)
  })

  test.beforeEach(async () => {
    // Reset describe-scoped session id so a test.skip() below does not let
    // afterEach soft-delete a stale id from the previous iteration.
    sessionId = ''

    // Discard any leftover active session from a prior iteration so
    // start_exam_session doesn't trip its duplicate-active-session guard.
    const { data: studentRow } = await admin
      .from('users')
      .select('id')
      .eq('email', ATTACKER_EMAIL)
      .maybeSingle()
    if (studentRow) {
      const { error: preCleanupError } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', studentRow.id)
        .is('ended_at', null)
        .is('deleted_at', null)
        .select('id')
      expect(preCleanupError).toBeNull()
    }

    // Start a fresh mock_exam session.
    const { data: startData, error: startError } = await attackerClient.rpc('start_exam_session', {
      p_subject_id: subjectId,
    })
    // Expected skip: seed fixture too small for the exam_config distribution.
    // Any other RPC error is unexpected and falls through to the assertion below.
    if (startError && /insufficient_questions/i.test(startError.message)) {
      test.skip(
        true,
        'insufficient seeded questions for exam_config — fixture limitation; covered by SQL integration tests',
      )
      return
    }
    expect(startError).toBeNull()
    expect(startData).toBeTruthy()

    type StartExamResult = {
      session_id: string
      question_ids?: string[]
      time_limit_seconds?: number
      total_questions?: number
      pass_mark?: number
    }
    expect(typeof startData).toBe('object')
    expect(startData).not.toBeNull()
    expect(typeof (startData as { session_id?: unknown }).session_id).toBe('string')
    const result = startData as StartExamResult
    sessionId = result.session_id
    expect(sessionId).toBeTruthy()

    // Re-read the row so we observe the actual persisted config.question_ids
    // (not whatever the RPC returns), giving us a faithful baseline for the
    // sanity assertion at the end of each attack test.
    const { data: row, error: readError } = await admin
      .from('quiz_sessions')
      .select('config')
      .eq('id', sessionId)
      .single()
    expect(readError).toBeNull()
    const config = (row?.config ?? {}) as { question_ids?: string[] }
    originalQuestionIds = Array.isArray(config.question_ids) ? config.question_ids : []
    expect(originalQuestionIds.length).toBeGreaterThan(0)
  })

  test.afterEach(async () => {
    // Soft-delete the session via service-role admin client (deleted_at is a
    // mutable column for service_role and bypasses the trigger).
    if (sessionId) {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select('id')
      if (error) {
        console.error('[quiz-session-config-injection cleanup] soft-delete failed:', error.message)
      } else if ((data?.length ?? 0) > 0) {
        console.log(
          `[quiz-session-config-injection cleanup] soft-deleted ${data?.length} session(s)`,
        )
      }
      expect(error).toBeNull()
    }
  })

  test('Attack 1 — config injection is blocked by trigger', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ config: { question_ids: ['00000000-0000-0000-0000-000000000001'] } })
      .eq('id', sessionId)

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('config')
    expect(error?.message ?? '').toContain('immutable')

    // Sanity: persisted config.question_ids unchanged.
    const { data: row } = await admin
      .from('quiz_sessions')
      .select('config, mode')
      .eq('id', sessionId)
      .single()
    const persisted = (row?.config ?? {}) as { question_ids?: string[] }
    expect(persisted.question_ids).toEqual(originalQuestionIds)
    expect(row?.mode).toBe('mock_exam')
  })

  test('Attack 2 — mode swap is blocked by trigger', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ mode: 'smart_review' })
      .eq('id', sessionId)

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('mode')
    expect(error?.message ?? '').toContain('immutable')

    const { data: row } = await admin
      .from('quiz_sessions')
      .select('config, mode')
      .eq('id', sessionId)
      .single()
    const persisted = (row?.config ?? {}) as { question_ids?: string[] }
    expect(persisted.question_ids).toEqual(originalQuestionIds)
    expect(row?.mode).toBe('mock_exam')
  })

  test('Attack 3 — total_questions inflate is blocked by trigger', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ total_questions: 999 })
      .eq('id', sessionId)

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('total_questions')
    expect(error?.message ?? '').toContain('immutable')

    const { data: row } = await admin
      .from('quiz_sessions')
      .select('config, mode')
      .eq('id', sessionId)
      .single()
    const persisted = (row?.config ?? {}) as { question_ids?: string[] }
    expect(persisted.question_ids).toEqual(originalQuestionIds)
    expect(row?.mode).toBe('mock_exam')
  })

  test('Attack 4 — started_at backdate is blocked by trigger', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ started_at: '2020-01-01T00:00:00Z' })
      .eq('id', sessionId)

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('started_at')
    expect(error?.message ?? '').toContain('immutable')

    const { data: row } = await admin
      .from('quiz_sessions')
      .select('config, mode')
      .eq('id', sessionId)
      .single()
    const persisted = (row?.config ?? {}) as { question_ids?: string[] }
    expect(persisted.question_ids).toEqual(originalQuestionIds)
    expect(row?.mode).toBe('mock_exam')
  })
})
