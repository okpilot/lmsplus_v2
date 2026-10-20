/**
 * Red Team Spec: start_discovery answer-key payload vs every live non-discovery mode (#1548) — Vector JJ.
 *
 *   JJ  start_discovery returns correct_option_id. With get_study_questions dropped it is the
 *       only Study key path, so a live internal_exam, vfr_rt_exam or smart_review row must make
 *       it raise another_session_active with no payload and no discovery row. JA pins mock_exam,
 *       JI pins quick_quiz. Control: with no session live the same call returns the key.
 *
 * Hermetic (code-style.md §7): questions are setupEoFixtures rows (E2E_REDTEAM_EO_MARKER) and
 * the victim's flag on the drawn question, soft-deleted in afterAll; sessions are soft-deleted
 * in afterEach.
 */

import { expect, test } from '@playwright/test'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import {
  cleanupEoFixtures,
  EG_MC_ACTIVE_KEY,
  type EoFixtures,
  setupEoFixtures,
} from './helpers/start-quiz-fixtures'

const TAG = 'rpc-start-discovery-exam-modes'
const LIVE_MODES = ['internal_exam', 'vfr_rt_exam', 'smart_review'] as const

type DiscoveryPayload = {
  session_id: string | null
  questions: { id: string; correct_option_id: string | null }[]
}

test.describe('Red Team: start_discovery refused under every live non-discovery mode (#1548)', () => {
  let fx: EoFixtures
  let subjectId: string

  test.beforeAll(async () => {
    fx = await setupEoFixtures()
    const { data: q, error } = await fx.admin
      .from('questions')
      .select('subject_id')
      .eq('id', fx.egMcActiveId)
      .single()
    if (error || !q) throw new Error(`subject lookup: ${error?.message}`)
    subjectId = q.subject_id as string
    const { error: flagErr } = await fx.admin
      .from('flagged_questions')
      .upsert(
        { student_id: fx.victimUserId, question_id: fx.egMcActiveId, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    if (flagErr) throw new Error(`flag seed: ${flagErr.message}`)
    await clearOpenSessions(fx.admin, fx.victimUserId, TAG)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await fx.admin
        .from('flagged_questions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', fx.victimUserId)
        .eq('question_id', fx.egMcActiveId)
        .is('deleted_at', null)
        .select('question_id')
      if (error) throw new Error(`flag cleanup: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[${TAG}] unflagged ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupEoFixtures(fx.admin, fx.createdQuestionIds)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test.afterEach(async () => {
    await clearOpenSessions(fx.admin, fx.victimUserId, TAG)
  })

  const startDiscovery = () =>
    fx.studentClient.rpc('start_discovery', {
      p_subject_id: subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: ['flagged'],
    })

  async function openModes(): Promise<string[]> {
    const { data, error } = await fx.admin
      .from('quiz_sessions')
      .select('mode')
      .eq('student_id', fx.victimUserId)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (error) throw new Error(`session lookup: ${error.message}`)
    return (data ?? []).map((r) => r.mode as string)
  }

  for (const mode of LIVE_MODES) {
    test(`JJ: start_discovery returns no answer key while the caller holds a live ${mode} session`, async () => {
      const control = await startDiscovery()
      expect(control.error).toBeNull()
      const payload = control.data as DiscoveryPayload
      expect(Array.isArray(payload?.questions)).toBe(true)
      expect(payload.questions.find((q) => q.id === fx.egMcActiveId)?.correct_option_id).toBe(
        EG_MC_ACTIVE_KEY,
      )
      await clearOpenSessions(fx.admin, fx.victimUserId, `${TAG} ${mode}`)

      const { error: insErr } = await fx.admin
        .from('quiz_sessions')
        .insert({ organization_id: fx.orgId, student_id: fx.victimUserId, mode })
      expect(insErr).toBeNull()
      expect(await openModes()).toEqual([mode])

      const res = await startDiscovery()
      expect(res.data).toBeNull()
      expect(res.error?.message ?? '').toMatch(/another_session_active/)
      expect(await openModes()).toEqual([mode])
    })
  }
})
