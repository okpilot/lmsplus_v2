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
 * The config columns above remain in authenticated's UPDATE grant, so a student's
 * attack reaches this trigger and is rejected with the 'immutable' message (the
 * assertions below). As of mig 20260605000001 (#611), the SCORING columns
 * (ended_at, correct_count, score_percentage, passed) were removed from that grant —
 * a student-direct write to them now returns 42501 before the trigger; see
 * quiz-session-score-forgery.spec.ts. Only deleted_at is freely student-writable.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

test.describe('Vector AM — quiz_sessions config injection (issue #554)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgId: string
  let subjectId: string
  let sessionId: string
  let originalFrozen: FrozenColumnsRow

  // Mirrors migration 079's BEFORE UPDATE OF column list. Re-using the same
  // string in beforeEach + helper guarantees the baseline and the assertion
  // cover identical columns — any future column added to the trigger only
  // needs to be added here once for every attack to gain coverage.
  const FROZEN_COLUMNS_SELECT =
    'config, total_questions, mode, time_limit_seconds, started_at, organization_id, student_id, subject_id, topic_id, created_at'

  type FrozenColumnsRow = {
    config: { question_ids?: string[] } | null
    total_questions: number | null
    mode: string | null
    time_limit_seconds: number | null
    started_at: string | null
    organization_id: string | null
    student_id: string | null
    subject_id: string | null
    topic_id: string | null
    created_at: string | null
  }

  // Sanity check shared by every attack test: re-reads ALL frozen columns via
  // admin (bypassing RLS) and asserts every one is byte-for-byte identical to
  // the post-start baseline. This is defense-in-depth on top of the trigger
  // error-message check — if a regression silently lets a write through on the
  // attacked column while leaving other frozen columns intact, the deep-equal
  // here catches it. Adding new attack vectors does not require helper edits.
  async function assertSessionStillLocked() {
    const { data: row } = await admin
      .from('quiz_sessions')
      .select(FROZEN_COLUMNS_SELECT)
      .eq('id', sessionId)
      .single()

    expect(row).not.toBeNull()
    expect(row as unknown as FrozenColumnsRow).toEqual(originalFrozen)
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // Resolve a subject + topic in the seeded org and ensure an exam_config exists
    // so start_exam_session reaches its question-selection / session-create path.
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    const topicId = picked.topicId

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
      const { data: discarded, error: preCleanupError } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', studentRow.id)
        .is('ended_at', null)
        .is('deleted_at', null)
        .select('id')
      expect(preCleanupError).toBeNull()
      if ((discarded?.length ?? 0) > 0) {
        console.log(
          `[quiz-session-config-injection pre-cleanup] discarded ${discarded?.length} stale session(s)`,
        )
      }
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

    // Re-read the row so we observe the actual persisted values (not whatever
    // the RPC returns) for every frozen column, giving us a faithful baseline
    // for the deep-equal sanity assertion at the end of each attack test.
    const { data: row, error: readError } = await admin
      .from('quiz_sessions')
      .select(FROZEN_COLUMNS_SELECT)
      .eq('id', sessionId)
      .single()
    expect(readError).toBeNull()
    expect(row).not.toBeNull()
    originalFrozen = row as unknown as FrozenColumnsRow
    const initialQuestionIds = originalFrozen.config?.question_ids ?? []
    expect(Array.isArray(initialQuestionIds)).toBe(true)
    expect(initialQuestionIds.length).toBeGreaterThan(0)
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

    await assertSessionStillLocked()
  })

  test('Attack 2 — mode swap is blocked by trigger', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ mode: 'smart_review' })
      .eq('id', sessionId)

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('mode')
    expect(error?.message ?? '').toContain('immutable')

    await assertSessionStillLocked()
  })

  test('Attack 3 — total_questions inflate is blocked by trigger', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ total_questions: 999 })
      .eq('id', sessionId)

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('total_questions')
    expect(error?.message ?? '').toContain('immutable')

    await assertSessionStillLocked()
  })

  test('Attack 4 — started_at backdate is blocked by trigger', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ started_at: '2020-01-01T00:00:00Z' })
      .eq('id', sessionId)

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('started_at')
    expect(error?.message ?? '').toContain('immutable')

    await assertSessionStillLocked()
  })

  // #615 — the remaining 6 frozen columns guarded by the BEFORE UPDATE OF
  // trigger (mig 20260502000001). Parametrized to avoid 6 near-identical
  // copies; each asserts the student UPDATE is rejected with the column name +
  // "immutable", then re-verifies all frozen columns are byte-identical.
  const REMAINING_FROZEN_COLUMNS: { column: string; value: unknown }[] = [
    { column: 'time_limit_seconds', value: 99_999 },
    { column: 'organization_id', value: '00000000-0000-0000-0000-000000000002' },
    { column: 'student_id', value: '00000000-0000-0000-0000-000000000003' },
    { column: 'subject_id', value: '00000000-0000-0000-0000-000000000004' },
    { column: 'topic_id', value: '00000000-0000-0000-0000-000000000005' },
    { column: 'created_at', value: '2020-01-01T00:00:00Z' },
  ]

  for (const { column, value } of REMAINING_FROZEN_COLUMNS) {
    test(`Attack — ${column} mutation is blocked by trigger`, async () => {
      const { error } = await attackerClient
        .from('quiz_sessions')
        .update({ [column]: value })
        .eq('id', sessionId)

      expect(error).not.toBeNull()
      expect(error?.message ?? '').toContain(column)
      expect(error?.message ?? '').toContain('immutable')

      await assertSessionStillLocked()
    })
  }
})
