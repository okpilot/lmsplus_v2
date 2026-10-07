/**
 * Red Team Spec: VFR RT exam finished through finish_quiz_session (#1026 PR 2d) — Vectors HM, HN
 *
 * The app now ends a VFR RT exam by saving each answer (save_quiz_answer) and calling
 * finish_quiz_session, which grades quiz_session_progress via _grade_session_progress.
 * save_quiz_answer's shape check accepts any string array for `order` and any zone/label
 * strings for `mapping`, so the forged-entry guard lives in the grader alone.
 *
 * HM (input-injection): a forged ordering answer (partial permutation, one item hedged into
 *     every slot) earns no credit at finish.
 * HN (input-injection): a forged diagram_label answer (one label hedged into every zone, one
 *     zone placed twice) earns no credit at finish.
 * CONTROL: the canonical order / mapping grades every row correct and part3_pct = 100.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'
import {
  VFR_RT_DIAGRAM_ANSWER,
  VFR_RT_MC_CORRECT,
  VFR_RT_ORDERING_KEY_IDS,
} from './helpers/seed-vfr-rt-part3'
import {
  cleanupVfrRtPool,
  seedVfrRtPool,
  VFR_RT_DF_ANSWER,
  VFR_RT_SA_ANSWER,
  type VfrRtPool,
} from './helpers/seed-vfr-rt-pool'

type ExamQuestion = { id: string; question_type: string }
type Answer = Record<string, unknown>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Progress-shaped correct answer per question type (the shape save_quiz_answer stores). */
const correctAnswer = (type: string): Answer => {
  switch (type) {
    case 'short_answer':
      return { response_text: VFR_RT_SA_ANSWER }
    case 'dialog_fill':
      return { blanks: [{ blank_index: 0, response_text: VFR_RT_DF_ANSWER }] }
    case 'multiple_choice':
      return { selected_option_id: VFR_RT_MC_CORRECT }
    case 'ordering':
      return { order: [...VFR_RT_ORDERING_KEY_IDS] }
    case 'diagram_label':
      return { mapping: VFR_RT_DIAGRAM_ANSWER.map((a) => ({ ...a })) }
    default:
      throw new Error(`correctAnswer: unsupported type ${type}`)
  }
}

const K0 = VFR_RT_ORDERING_KEY_IDS[0] as string
const D0 = VFR_RT_DIAGRAM_ANSWER[0] as { zone_id: string; label_id: string }
const D1 = VFR_RT_DIAGRAM_ANSWER[1] as { zone_id: string; label_id: string }

const FORGERIES: Array<{ name: string; ordering: Answer; diagram: Answer }> = [
  {
    name: 'partial permutation + one label hedged into every zone',
    ordering: { order: [K0] },
    diagram: {
      mapping: VFR_RT_DIAGRAM_ANSWER.map((a) => ({ zone_id: a.zone_id, label_id: D0.label_id })),
    },
  },
  {
    name: 'one item hedged into every slot + one zone placed twice',
    ordering: { order: VFR_RT_ORDERING_KEY_IDS.map(() => K0) },
    diagram: {
      mapping: [
        { zone_id: D0.zone_id, label_id: D0.label_id },
        { zone_id: D0.zone_id, label_id: D1.label_id },
      ],
    },
  },
]

test.describe('Red Team: finish_quiz_session VFR RT forged Part 3 progress (HM, HN)', () => {
  test.setTimeout(120_000)

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
        if ((data?.length ?? 0) > 0) console.log(`[vfr-finish] soft-deleted ${data?.length}`)
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

  const startExam = async () => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    const started = await student.rpc('start_vfr_rt_exam_session', { p_subject_id: pool.subjectId })
    expect(started.error).toBeNull()
    if (!isRecord(started.data) || typeof started.data.session_id !== 'string')
      throw new Error('start_vfr_rt_exam_session: bad shape')
    const sessionId = started.data.session_id
    createdSessionIds.add(sessionId)
    const q = await student.rpc('get_vfr_rt_exam_questions', { p_session_id: sessionId })
    expect(q.error).toBeNull()
    expect(Array.isArray(q.data)).toBe(true)
    const questions = q.data as ExamQuestion[]
    const ordering = questions.find((x) => x.question_type === 'ordering')
    const diagram = questions.find((x) => x.question_type === 'diagram_label')
    if (!ordering || !diagram) throw new Error('exam drew no ordering / diagram_label question')
    return { sessionId, questions, orderingId: ordering.id, diagramId: diagram.id }
  }

  const saveAll = async (
    sessionId: string,
    questions: ExamQuestion[],
    over: Map<string, Answer>,
  ) => {
    for (const q of questions) {
      const { error } = await student.rpc('save_quiz_answer', {
        p_session_id: sessionId,
        p_question_id: q.id,
        p_answer: over.get(q.id) ?? correctAnswer(q.question_type),
        p_time_spent_ms: 1000,
        p_device_id: null,
      })
      expect(error, `save ${q.question_type} ${q.id}`).toBeNull()
    }
  }

  const finish = async (sessionId: string) => {
    const r = await student.rpc('finish_quiz_session', {
      p_session_id: sessionId,
      p_device_id: null,
    })
    expect(r.error).toBeNull()
    if (!isRecord(r.data)) throw new Error('finish: bad shape')
    return r.data
  }

  const rowsFor = async (sessionId: string, questionId: string) => {
    const { data, error } = await admin
      .from('quiz_session_answers')
      .select('is_correct')
      .eq('session_id', sessionId)
      .eq('question_id', questionId)
    if (error) throw new Error(`rowsFor: ${error.message}`)
    return (data ?? []).map((r) => r.is_correct)
  }

  test('HM/HN: forged ordering and diagram_label progress earns no Part 3 credit at finish', async () => {
    for (const f of FORGERIES) {
      const { sessionId, questions, orderingId, diagramId } = await startExam()
      await saveAll(
        sessionId,
        questions,
        new Map([
          [orderingId, f.ordering],
          [diagramId, f.diagram],
        ]),
      )
      const out = await finish(sessionId)
      expect(await rowsFor(sessionId, orderingId), f.name).toEqual([])
      expect(await rowsFor(sessionId, diagramId), f.name).toEqual([])
      // 8 Part 3 questions: 6 MC correct, ordering + diagram uncredited.
      expect(Number(out.part3_pct), f.name).toBe(75)
      expect(Number(out.part1_pct), f.name).toBe(100)
      expect(Number(out.part2_pct), f.name).toBe(100)
    }

    // CONTROL: the canonical order and mapping are graded and fully credited.
    const { sessionId, questions, orderingId, diagramId } = await startExam()
    await saveAll(sessionId, questions, new Map())
    const out = await finish(sessionId)
    expect(await rowsFor(sessionId, orderingId)).toEqual(VFR_RT_ORDERING_KEY_IDS.map(() => true))
    expect(await rowsFor(sessionId, diagramId)).toEqual(VFR_RT_DIAGRAM_ANSWER.map(() => true))
    expect(Number(out.part3_pct)).toBe(100)
    expect(out.passed_overall).toBe(true)
  })
})
