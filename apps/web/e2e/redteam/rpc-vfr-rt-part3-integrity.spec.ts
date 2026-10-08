/**
 * Red Team Spec: VFR RT exam Part 3 — ordering + diagram_label (migs 20260929000200..0600).
 *
 * Vectors (attack-surface.md):
 *  - FY  get_vfr_rt_exam_questions serves an in-flight Part 3 ordering / diagram_label
 *        question with no answer key (no canonical order marker, no zone -> label map).
 *        CONTROL: the ended-session results RPC does return that key.
 *
 * FZ and GA (forged ordering / diagram_label entry sets) are covered by
 * rpc-finish-vfr-rt-forged-progress.spec.ts (HM / HN).
 */

import { expect, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { buildVfrRtProgressAnswers, saveAndFinish } from './helpers/finish-session'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'
import { VFR_RT_DIAGRAM_ANSWER, VFR_RT_ORDERING_KEY_IDS } from './helpers/seed-vfr-rt-part3'
import { cleanupVfrRtPool, seedVfrRtPool, type VfrRtPool } from './helpers/seed-vfr-rt-pool'

type Entry = Record<string, unknown>
type ExamQuestion = {
  id: string
  question_type: string
  ordering_items_shuffled: unknown
  diagram_config_public: unknown
}
type StartedSession = { session_id: string }

test.describe('Red Team: VFR RT Part 3 ordering / diagram_label integrity', () => {
  let admin: ReturnType<typeof getAdminClient>
  let student: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let pool: VfrRtPool
  let orgId: string
  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    pool = await seedVfrRtPool({ admin, orgId, adminUserId: seed.victimUserId })
    student = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
  })

  test.afterAll(async () => {
    await cleanupVfrRtPool({ admin, orgId, pool })
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      if (createdSessionIds.size > 0) {
        const { data, error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', Array.from(createdSessionIds))
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`afterEach soft-delete: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[vfr-rt-part3] soft-deleted ${data?.length} session(s)`)
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      createdSessionIds.clear()
    }
    try {
      await cleanupStudentActiveSessions(VICTIM_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  const startExam = async (): Promise<{ sessionId: string; questions: ExamQuestion[] }> => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    const { data: startedRaw, error: startErr } = await student.rpc('start_vfr_rt_exam_session', {
      p_subject_id: pool.subjectId,
    })
    expect(startErr).toBeNull()
    expect(startedRaw).not.toBeNull()
    const sessionId = (startedRaw as StartedSession).session_id
    createdSessionIds.add(sessionId)
    const { data: qRaw, error: qErr } = await student.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(qErr).toBeNull()
    expect(Array.isArray(qRaw)).toBe(true)
    return { sessionId, questions: qRaw as ExamQuestion[] }
  }

  const questionOfType = (questions: ExamQuestion[], type: string): ExamQuestion => {
    const q = questions.find((x) => x.question_type === type)
    expect(q, `no ${type} question drawn`).toBeDefined()
    return q as ExamQuestion
  }

  test('FY: an in-flight Part 3 ordering / diagram_label question carries no answer key', async () => {
    const { sessionId, questions } = await startExam()
    const ordering = questionOfType(questions, 'ordering')
    const diagram = questionOfType(questions, 'diagram_label')

    expect(Array.isArray(ordering.ordering_items_shuffled)).toBe(true)
    const items = ordering.ordering_items_shuffled as Array<Record<string, unknown>>
    expect(items.length).toBe(VFR_RT_ORDERING_KEY_IDS.length)
    for (const item of items) expect(Object.keys(item).sort()).toEqual(['id', 'text'])
    expect(items.map((i) => i.id).sort()).toEqual([...VFR_RT_ORDERING_KEY_IDS].sort())

    const pub = diagram.diagram_config_public as Record<string, unknown>
    expect(Object.keys(pub).sort()).toEqual(['image_ref', 'labels', 'zones'])
    const zones = pub.zones as Array<Record<string, unknown>>
    expect(zones.length).toBe(VFR_RT_DIAGRAM_ANSWER.length)
    for (const z of zones) expect(Object.keys(z).sort()).toEqual(['h', 'id', 'w', 'x', 'y'])
    for (const l of pub.labels as Array<Record<string, unknown>>) {
      expect(Object.keys(l).sort()).toEqual(['id', 'text'])
    }
    const wire = JSON.stringify(questions)
    expect(wire).not.toContain('zone_id')
    expect(wire).not.toContain('label_id')
    expect(wire).not.toContain('correct_order')
    expect(wire).not.toContain('correct_option_id')

    // CONTROL: the key exists and is served once the session has ended.
    const { error: finErr } = await saveAndFinish(
      student,
      sessionId,
      buildVfrRtProgressAnswers(questions),
    )
    expect(finErr).toBeNull()
    const { data: res, error: resErr } = await student.rpc('get_vfr_rt_exam_results', {
      p_session_id: sessionId,
    })
    expect(resErr).toBeNull()
    const review = (res as { questions: Array<{ question_id: string; key: Entry }> }).questions
    const oKey = review.find((q) => q.question_id === ordering.id)?.key
    const dKey = review.find((q) => q.question_id === diagram.id)?.key
    expect(oKey?.correct_order).toEqual(VFR_RT_ORDERING_KEY_IDS)
    expect(dKey?.answer).toEqual(VFR_RT_DIAGRAM_ANSWER)
  })
})
