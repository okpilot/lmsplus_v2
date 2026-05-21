/**
 * Red Team Spec — Vector: start_quiz_session p_mode whitelist (issue #629)
 *
 * Attack: An authenticated student calls `start_quiz_session` with
 *         p_mode='mock_exam' or p_mode='internal_exam'. Without the whitelist,
 *         this creates a quiz_sessions row whose mode column bypasses all
 *         exam_config validation performed by start_exam_session (mig 040) and
 *         start_internal_exam_session (mig 058). The attacker could then call
 *         batch_submit_quiz against a self-assembled question set, effectively
 *         generating a fake exam report without completing a real exam.
 *
 * Defense: Migration 081 adds an early `IF p_mode NOT IN ('smart_review',
 *          'quick_quiz') THEN RAISE EXCEPTION 'mode_not_allowed'` immediately
 *          after the auth check in start_quiz_session. The whitelist runs BEFORE
 *          the active-user gate so mode_not_allowed cannot be used to probe
 *          'user inactive' via timing or error differences.
 *
 * No afterEach cleanup — the RPC raises before any INSERT reaches the table.
 * Both attacks assert count === 0 new rows as a positive verification of the
 * no-insert claim. If a future contributor adds a test case that exercises a
 * normal (accepted) mode, that test MUST add session cleanup in its own
 * afterEach or afterAll block.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
} from './helpers/seed'

test.describe('Vector — start_quiz_session p_mode whitelist (issue #629)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let questionIds: string[]
  let subjectId: string
  let topicId: string
  let testStartIso: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // Pick any subject/topic with active questions. The RPC is expected to
    // raise mode_not_allowed before it validates question_ids, so any valid
    // UUIDs from the seeded org are sufficient.
    const picked = await pickSubjectWithQuestions(admin, { orgId: seed.orgId })
    subjectId = picked.subjectId
    topicId = picked.topicId

    // Resolve one real question UUID to pass syntactically valid input.
    const { data: questions, error: qError } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', seed.orgId)
      .eq('subject_id', subjectId)
      .eq('topic_id', topicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(1)
    if (qError || !questions || questions.length === 0) {
      throw new Error(
        `start-quiz-session-mode-confusion: could not resolve a question UUID: ${qError?.message}`,
      )
    }
    questionIds = questions.map((q: { id: string }) => q.id)
  })

  test.beforeEach(async () => {
    // Capture timestamp before each attack so the no-insert assertion can
    // scope the SELECT to rows created after this point.
    testStartIso = new Date().toISOString()
  })

  test('Attack 1 — mock_exam mode is rejected before any INSERT', async () => {
    const { error } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'mock_exam',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('mode_not_allowed')

    // Positive no-insert assertion: zero quiz_sessions rows were created for
    // this attacker after the test started.
    const { count, error: countError } = await admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', attackerUserId)
      .gte('created_at', testStartIso)
    expect(countError).toBeNull()
    expect(count).toBe(0)
  })

  test('Attack 2 — internal_exam mode is rejected before any INSERT', async () => {
    const { error } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'internal_exam',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('mode_not_allowed')

    // Positive no-insert assertion: zero quiz_sessions rows were created for
    // this attacker after the test started.
    const { count, error: countError } = await admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', attackerUserId)
      .gte('created_at', testStartIso)
    expect(countError).toBeNull()
    expect(count).toBe(0)
  })
})
