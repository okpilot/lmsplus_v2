/**
 * Red Team Spec: one-RPC quiz starts (#1548, mig 20261020000100) — Vectors IZ, JA, JB, JC, JD.
 *
 *   IZ  start_discovery (SECURITY DEFINER, returns correct_option_id) — an org-B caller drawing
 *       from the shared egmont subject receives only org-B questions. Control: the egmont caller
 *       receives the egmont fixture WITH its key.
 *   JA  start_discovery mid-exam answer oracle — a live mock_exam session raises
 *       another_session_active, returns no payload, creates no discovery row and no audit row.
 *       Control: the same call with no exam live returns the key.
 *   JB  start_practice_quiz (SECURITY INVOKER) — an org-B caller receives only org-B ids.
 *       Control: the org-B fixture is drawn.
 *   JC  start_discovery concurrent double start — at most one active discovery row survives and
 *       every failed call raises another_session_active. Control: a sequential re-start
 *       soft-deletes the first row.
 *   JD  start_discovery draft / soft-deleted / non-MC exclusion — flagged draft, soft-deleted and
 *       short_answer questions are never drawn (their keys never returned). Control: the flagged
 *       active MC question is drawn with its key.
 *
 * Hermetic (code-style.md §7): questions are setupEoFixtures rows (E2E_REDTEAM_EO_MARKER),
 * soft-deleted in afterAll; open sessions and the victim's fixture flags are soft-deleted in
 * afterEach through a per-step error accumulator.
 */

import { expect, test } from '@playwright/test'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import {
  cleanupEoFixtures,
  EG_MC_ACTIVE_KEY,
  type EoFixtures,
  OTHER_ORG_MC_KEY,
  setupEoFixtures,
} from './helpers/get-study-questions-eo-setup'

type DiscoveryQuestion = { id: string; correct_option_id: string | null }
type DiscoveryPayload = {
  session_id: string | null
  questions: DiscoveryQuestion[]
  flagged_ids: string[]
}
type PracticePayload = { session_id: string | null; question_ids: string[] }

function asDiscovery(data: unknown): DiscoveryPayload {
  expect(data).not.toBeNull()
  const p = data as { questions?: unknown; flagged_ids?: unknown }
  expect(Array.isArray(p.questions)).toBe(true)
  expect(Array.isArray(p.flagged_ids)).toBe(true)
  return data as DiscoveryPayload
}

function asPractice(data: unknown): PracticePayload {
  expect(data).not.toBeNull()
  expect(Array.isArray((data as { question_ids?: unknown }).question_ids)).toBe(true)
  return data as PracticePayload
}

test.describe('Red Team: one-RPC quiz starts (#1548)', () => {
  let fx: EoFixtures
  let subjectId: string
  let crossOrgUserId: string
  const flaggedIds = new Set<string>()

  test.beforeAll(async () => {
    fx = await setupEoFixtures()
    const { data: q, error } = await fx.admin
      .from('questions')
      .select('subject_id')
      .eq('id', fx.egMcActiveId)
      .single()
    if (error || !q) throw new Error(`subject lookup: ${error?.message}`)
    subjectId = q.subject_id as string
    const { data: who, error: whoErr } = await fx.crossOrgClient.auth.getUser()
    if (whoErr || !who.user) throw new Error(`cross-org getUser: ${whoErr?.message}`)
    crossOrgUserId = who.user.id
    await clearOpenSessions(fx.admin, fx.victimUserId, 'rpc-start-quiz-one-rpc')
    await clearOpenSessions(fx.admin, crossOrgUserId, 'rpc-start-quiz-one-rpc')
  })

  test.afterAll(async () => {
    await cleanupEoFixtures(fx.admin, fx.createdQuestionIds)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await clearOpenSessions(fx.admin, fx.victimUserId, 'rpc-start-quiz-one-rpc')
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await clearOpenSessions(fx.admin, crossOrgUserId, 'rpc-start-quiz-one-rpc')
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      if (flaggedIds.size > 0) {
        const { data, error } = await fx.admin
          .from('flagged_questions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('student_id', fx.victimUserId)
          .in('question_id', Array.from(flaggedIds))
          .is('deleted_at', null)
          .select('question_id')
        if (error) throw new Error(`flag cleanup: ${error.message}`)
        if ((data?.length ?? 0) > 0)
          console.info(`[rpc-start-quiz-one-rpc] unflagged ${data?.length}`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      flaggedIds.clear()
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  async function flagForVictim(questionIds: string[]): Promise<void> {
    const rows = questionIds.map((question_id) => ({
      student_id: fx.victimUserId,
      question_id,
      deleted_at: null,
    }))
    const { error } = await fx.admin
      .from('flagged_questions')
      .upsert(rows, { onConflict: 'student_id,question_id' })
    if (error) throw new Error(`flag seed: ${error.message}`)
    for (const id of questionIds) flaggedIds.add(id)
  }

  async function startVictimDiscovery() {
    return fx.studentClient.rpc('start_discovery', {
      p_subject_id: subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: ['flagged'],
    })
  }

  async function activeDiscoveryIds(studentId: string): Promise<string[]> {
    const { data, error } = await fx.admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', studentId)
      .eq('mode', 'discovery')
      .is('ended_at', null)
      .is('deleted_at', null)
    if (error) throw new Error(`discovery lookup: ${error.message}`)
    return (data ?? []).map((r) => r.id as string)
  }

  async function orgOf(ids: string[]): Promise<Set<string>> {
    const { data, error } = await fx.admin.from('questions').select('organization_id').in('id', ids)
    if (error) throw new Error(`org lookup: ${error.message}`)
    return new Set((data ?? []).map((r) => r.organization_id as string))
  }

  test('IZ: start_discovery serves an org-B caller only org-B questions and keys', async () => {
    await flagForVictim([fx.egMcActiveId])
    const control = await startVictimDiscovery()
    expect(control.error).toBeNull()
    const controlRow = asDiscovery(control.data).questions.find((q) => q.id === fx.egMcActiveId)
    expect(controlRow?.correct_option_id).toBe(EG_MC_ACTIVE_KEY)

    const { data, error } = await fx.crossOrgClient.rpc('start_discovery', {
      p_subject_id: subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: null,
    })
    expect(error).toBeNull()
    const ids = asDiscovery(data).questions.map((q) => q.id)
    expect(ids).toContain(fx.otherOrgMcId)
    const own = asDiscovery(data).questions.find((q) => q.id === fx.otherOrgMcId)
    expect(own?.correct_option_id).toBe(OTHER_ORG_MC_KEY)
    expect(ids).not.toContain(fx.egMcActiveId)
    expect(await orgOf(ids)).toEqual(new Set([fx.otherOrgId]))
  })

  test('JA: start_discovery refuses the answer-key payload while a mock exam is live', async () => {
    await flagForVictim([fx.egMcActiveId])
    const control = await startVictimDiscovery()
    expect(control.error).toBeNull()
    expect(asDiscovery(control.data).questions.map((q) => q.correct_option_id)).toContain(
      EG_MC_ACTIVE_KEY,
    )
    await clearOpenSessions(fx.admin, fx.victimUserId, 'rpc-start-quiz-one-rpc JA')

    const { error: insErr } = await fx.admin
      .from('quiz_sessions')
      .insert({ organization_id: fx.orgId, student_id: fx.victimUserId, mode: 'mock_exam' })
    expect(insErr).toBeNull()
    const auditBefore = await fx.admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', fx.victimUserId)
      .eq('event_type', 'discovery.started')
    expect(auditBefore.error).toBeNull()

    const { data, error } = await startVictimDiscovery()
    expect(error?.message ?? '').toMatch(/another_session_active/)
    expect(data).toBeNull()
    expect(await activeDiscoveryIds(fx.victimUserId)).toHaveLength(0)
    const auditAfter = await fx.admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', fx.victimUserId)
      .eq('event_type', 'discovery.started')
    expect(auditAfter.error).toBeNull()
    expect(auditAfter.count).toBe(auditBefore.count)
  })

  test('JB: start_practice_quiz draws only the caller own-org ids', async () => {
    const { data, error } = await fx.crossOrgClient.rpc('start_practice_quiz', {
      p_subject_id: subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: ['all'],
    })
    expect(error).toBeNull()
    const payload = asPractice(data)
    expect(payload.question_ids).toContain(fx.otherOrgMcId)
    expect(payload.question_ids).not.toContain(fx.egMcActiveId)
    expect(await orgOf(payload.question_ids)).toEqual(new Set([fx.otherOrgId]))
    expect(typeof payload.session_id).toBe('string')
  })

  test('JC: concurrent start_discovery calls leave exactly one active discovery session', async () => {
    await flagForVictim([fx.egMcActiveId])
    const first = await startVictimDiscovery()
    expect(first.error).toBeNull()
    const firstId = asDiscovery(first.data).session_id
    const second = await startVictimDiscovery()
    expect(second.error).toBeNull()
    const secondId = asDiscovery(second.data).session_id
    expect(secondId).not.toBe(firstId)
    expect(await activeDiscoveryIds(fx.victimUserId)).toEqual([secondId])
    const { data: firstRow, error: firstErr } = await fx.admin
      .from('quiz_sessions')
      .select('deleted_at, ended_at')
      .eq('id', firstId as string)
      .single()
    expect(firstErr).toBeNull()
    expect(firstRow?.deleted_at).not.toBeNull()
    expect(firstRow?.ended_at).toBeNull()

    const results = await Promise.all([startVictimDiscovery(), startVictimDiscovery()])
    const winners = results
      .filter((r) => r.error === null)
      .map((r) => asDiscovery(r.data).session_id)
    for (const r of results.filter((x) => x.error !== null)) {
      expect(r.error?.message ?? '').toMatch(/another_session_active/)
      expect(r.data).toBeNull()
    }
    expect(winners.length).toBeGreaterThan(0)
    const active = await activeDiscoveryIds(fx.victimUserId)
    expect(active).toHaveLength(1)
    expect(winners).toContain(active[0])
  })

  test('JD: start_discovery never draws a flagged draft, soft-deleted or non-MC question', async () => {
    const { data: del, error: delErr } = await fx.admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', fx.egMcDeletedId)
      .is('deleted_at', null)
      .select('id')
    expect(delErr).toBeNull()
    expect(del?.length ?? 0).toBeLessThanOrEqual(1)
    const { data: deletedRow, error: readErr } = await fx.admin
      .from('questions')
      .select('deleted_at')
      .eq('id', fx.egMcDeletedId)
      .single()
    expect(readErr).toBeNull()
    expect(deletedRow?.deleted_at).not.toBeNull()
    const excluded = [fx.egMcDraftId, fx.egMcDeletedId, fx.egShortAnswerId]
    await flagForVictim([fx.egMcActiveId, ...excluded])
    const { data: flags, error: flagErr } = await fx.admin
      .from('flagged_questions')
      .select('question_id')
      .eq('student_id', fx.victimUserId)
      .in('question_id', excluded)
      .is('deleted_at', null)
    expect(flagErr).toBeNull()
    expect(flags).toHaveLength(3)

    const { data, error } = await startVictimDiscovery()
    expect(error).toBeNull()
    const payload = asDiscovery(data)
    const ids = payload.questions.map((q) => q.id)
    expect(ids).toContain(fx.egMcActiveId)
    expect(payload.questions.find((q) => q.id === fx.egMcActiveId)?.correct_option_id).toBe(
      EG_MC_ACTIVE_KEY,
    )
    expect(payload.flagged_ids).toContain(fx.egMcActiveId)
    for (const id of excluded) {
      expect(ids).not.toContain(id)
      expect(payload.flagged_ids).not.toContain(id)
    }
  })
})
