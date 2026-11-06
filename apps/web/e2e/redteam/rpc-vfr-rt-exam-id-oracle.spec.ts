/**
 * Red Team Spec: id-sort and position oracles on get_vfr_rt_exam_questions (Vector LA, #1215).
 *
 * Threat: Vector EY pins get_quiz_questions only. The graded exam path re-implements the same
 * projection (mig 20260929000300), and the stored `labels` order can equal the key order, so the
 * delivery's shuffle and the derived ids are what stand between a student and the pairing.
 *
 * Attacks, as the exam student on an in-flight session:
 *  - LA1 sort delivered labels by id, zip against zones.
 *  - LA2 read label / item position across repeated deliveries.
 *  - LA3 direct PostgREST SELECT of the key columns.
 * Controls: the fixture's stored label order zipped against its zones DOES equal the key, so a
 * delivery in stored order would leak it; the student reads a non-key column of the same row.
 */

import { expect, test } from '@playwright/test'
import { deriveContentId } from '../../scripts/content-ids'
import { deriveLabelId, deriveZoneId } from '../../scripts/diagram-content'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'
import { VFR_RT_DIAGRAM_ANSWER, VFR_RT_ORDERING_KEY_IDS } from './helpers/seed-vfr-rt-part3'
import { cleanupVfrRtPool, seedVfrRtPool, type VfrRtPool } from './helpers/seed-vfr-rt-pool'

type Zone = { id: string }
type Label = { id: string; text: string }
type ExamQuestion = {
  id: string
  question_type: string
  ordering_items_shuffled: Label[] | null
  diagram_config_public: { image_ref: string; zones: Zone[]; labels: Label[] } | null
}

const DELIVERIES = 12
const pairKey = (pairs: Array<{ zone_id: string; label_id: string }>) =>
  pairs.map((p) => `${p.zone_id}=${p.label_id}`)

test.describe('Red Team: get_vfr_rt_exam_questions id and position oracles (Vector LA)', () => {
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
        if ((data?.length ?? 0) > 0) console.log(`[LA] soft-deleted ${data?.length} session(s)`)
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

  async function deliver(sessionId: string): Promise<ExamQuestion[]> {
    const { data, error } = await student.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    return data as ExamQuestion[]
  }

  async function startExam(): Promise<{ sessionId: string; questions: ExamQuestion[] }> {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    const { data, error } = await student.rpc('start_vfr_rt_exam_session', {
      p_subject_id: pool.subjectId,
    })
    expect(error).toBeNull()
    const sessionId = (data as { session_id: string }).session_id
    createdSessionIds.add(sessionId)
    return { sessionId, questions: await deliver(sessionId) }
  }

  function configOf(questions: ExamQuestion[]) {
    const q = questions.find((x) => x.question_type === 'diagram_label')
    if (!q?.diagram_config_public) throw new Error('no diagram_label question drawn')
    return { id: q.id, config: q.diagram_config_public }
  }

  function itemsOf(questions: ExamQuestion[]): Label[] {
    const q = questions.find((x) => x.question_type === 'ordering')
    if (!q?.ordering_items_shuffled) throw new Error('no ordering question drawn')
    return q.ordering_items_shuffled
  }

  test('LA1: delivered ids are derived and sorting them does not rebuild the key', async () => {
    const { questions } = await startExam()
    const { id, config } = configOf(questions)
    const { zones, labels } = config
    const expectedKey = pairKey(VFR_RT_DIAGRAM_ANSWER)

    expect(zones).toHaveLength(VFR_RT_DIAGRAM_ANSWER.length)
    expect(labels.length).toBeGreaterThan(zones.length)
    zones.forEach((z, i) => {
      expect(z.id).toBe(deriveZoneId(config.image_ref, i))
    })
    for (const l of labels) expect(l.id).toBe(deriveLabelId(l.text))

    // CONTROL: stored label order zipped against the zones IS the key.
    const { data: stored, error: storedErr } = await admin
      .from('questions')
      .select('diagram_config')
      .eq('id', id)
      .single()
    expect(storedErr).toBeNull()
    if (!stored) throw new Error('LA1: stored question row missing')
    const storedLabels = (stored.diagram_config as { labels: Label[] }).labels
    const zipped = (ordered: Label[]) =>
      pairKey(zones.map((z, i) => ({ zone_id: z.id, label_id: (ordered[i] as Label).id })))
    expect(zipped(storedLabels).sort()).toEqual([...expectedKey].sort())

    const byId = [...labels].sort((a, b) => (a.id < b.id ? -1 : 1))
    expect(zipped(byId).sort()).not.toEqual([...expectedKey].sort())
  })

  test('LA2: label and item position varies across deliveries of one session', async () => {
    const { sessionId, questions } = await startExam()
    const labelOrders = new Set<string>()
    const itemOrders = new Set<string>()
    let current = questions
    for (let i = 0; i < DELIVERIES; i++) {
      labelOrders.add(
        configOf(current)
          .config.labels.map((l) => l.id)
          .join(),
      )
      itemOrders.add(
        itemsOf(current)
          .map((x) => x.id)
          .join(),
      )
      current = await deliver(sessionId)
    }
    expect(labelOrders.size).toBeGreaterThan(1)
    expect(itemOrders.size).toBeGreaterThan(1)

    const items = itemsOf(questions)
    expect(items.map((x) => x.id).sort()).toEqual([...VFR_RT_ORDERING_KEY_IDS].sort())
    for (const item of items) expect(item.id).toBe(deriveContentId('o', [item.text]))
  })

  test('LA3: the student cannot SELECT the key columns of a question in the exam', async () => {
    const { questions } = await startExam()
    const { id } = configOf(questions)

    // CONTROL: the row is readable, so the denial below is the column grant.
    const { data: visible, error: visibleErr } = await student
      .from('questions')
      .select('id')
      .eq('id', id)
    expect(visibleErr).toBeNull()
    expect(visible).toHaveLength(1)

    for (const column of ['diagram_config', 'ordering_items']) {
      const { data, error } = await student.from('questions').select(column).eq('id', id)
      expect(error?.code, column).toBe('42501')
      expect(data, column).toBeNull()
    }
  })
})
