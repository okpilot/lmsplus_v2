/**
 * get_vfr_rt_exam_results and complete_overdue_exam_session — Part 3 ordering / diagram_label
 * (migs 20260929000500, 20260929000600): answer keys appear only after the exam ended, part 3 counts
 * the new types, and an overdue auto-completion scores them through the shared part-score helper.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { finishSeedSession } from './finish-fixture'
import { requireRpcResult } from './guards'
import { P, type SeedAnswer, saveAndFinish } from './save-and-finish'
import { admin } from './vfr-rt-helpers'
import { createPart3Org, type Part3Org, startPart3Exam } from './vfr-rt-part3-org'

type ResultEntry = {
  question_id: string
  question_type: string
  answers: Array<{ blank_index: number | null; is_correct: boolean }>
  key: Record<string, unknown>
}
type Results = {
  part3_pct: number | string
  correct_count: number
  questions: ResultEntry[]
}

describe('get_vfr_rt_exam_results — Part 3 ordering and diagram', () => {
  let org: Part3Org
  let sessionId: string
  let submittedPart3: number
  let preEndError: string | undefined
  let preEndData: unknown

  const call = () => org.studentClient.rpc('get_vfr_rt_exam_results', { p_session_id: sessionId })

  beforeAll(async () => {
    org = await createPart3Org('pres')
    sessionId = (await startPart3Exam(org)).session_id
    const pre = await call()
    preEndError = pre.error?.message
    preEndData = pre.data

    const [ord0, ord1] = org.ordering as [
      (typeof org.ordering)[number],
      (typeof org.ordering)[number],
    ]
    // Fixed fixture sizes (vfr-rt-part3-helpers): 4 ordering items, 3 zones, 4 labels, 4 MC ids.
    const slot = (q: typeof ord0, order: number[]): SeedAnswer => ({
      questionId: q.id,
      answer: P.ordering(order.map((from) => q.items[from]!.id)),
    })
    const d = org.diagram
    const answers: SeedAnswer[] = [
      ...org.mcIds.map((id) => ({ questionId: id, answer: P.mc('b') })),
      slot(ord0, [0, 1, 2, 3]),
      slot(ord1, [1, 0, 2, 3]),
      {
        questionId: d.id,
        answer: P.diagram([
          { zone_id: d.zones[0]!.id, label_id: d.labels[0]!.id },
          { zone_id: d.zones[1]!.id, label_id: d.labels[1]!.id },
          { zone_id: d.zones[2]!.id, label_id: d.labels[3]!.id },
        ]),
      },
    ]
    const result = await saveAndFinish(org.studentClient, sessionId, answers)
    submittedPart3 = Number(result.part3_pct)
  })
  afterAll(async () => {
    await org?.cleanup()
  })

  it('withholds ordering and diagram keys until the exam has ended', async () => {
    expect(preEndError).toContain('not completed')
    expect(preEndData).toBeNull()
    // Control: once ended, the same call succeeds and carries the keys withheld above.
    const { data, error } = await call()
    expect(error).toBeNull()
    const keys = requireRpcResult<Results>(data, 'get_vfr_rt_exam_results')
      .questions.filter(
        (q) => q.question_type === 'ordering' || q.question_type === 'diagram_label',
      )
      .map((q) => q.key)
    expect(keys).toHaveLength(4)
  })

  it('reveals the stored order and item texts for each ordering question after the exam', async () => {
    const { data } = await call()
    const res = requireRpcResult<Results>(data, 'get_vfr_rt_exam_results')
    const ordering = res.questions.filter((q) => q.question_type === 'ordering')
    expect(ordering).toHaveLength(org.ordering.length)
    for (const entry of ordering) {
      const fixture = org.ordering.find((o) => o.id === entry.question_id)
      expect(fixture).toBeDefined()
      // toBeDefined above guarantees fixture.
      expect(entry.key).toEqual({
        correct_order: fixture!.items.map((i) => i.id),
        items: fixture!.items,
      })
    }
  })

  it('reveals the answer mapping, zones and labels for the diagram question after the exam', async () => {
    const { data } = await call()
    const entry = requireRpcResult<Results>(data, 'get_vfr_rt_exam_results').questions.find(
      (q) => q.question_type === 'diagram_label',
    )
    expect(entry).toBeDefined()
    // toBeDefined above guarantees entry.
    expect(entry!.key).toEqual({
      answer: org.diagram.answer,
      zones: org.diagram.zones,
      labels: org.diagram.labels,
    })
    expect(entry!.answers.map((a) => a.is_correct)).toEqual([true, true, false])
  })

  it('scores part 3 over multiple-choice, ordering and diagram questions, matching the finish result', async () => {
    const { data } = await call()
    const res = requireRpcResult<Results>(data, 'get_vfr_rt_exam_results')
    // (4 MC + 1 + 0.5 + 0 + 2/3) / 8 questions
    expect(Number(res.part3_pct)).toBe(77.08)
    expect(Number(res.part3_pct)).toBe(submittedPart3)
  })

  it('keeps the graded part 3 score on results and finish replay after the diagram question gains a zone', async () => {
    const { data: before, error: readErr } = await admin
      .from('questions')
      .select('diagram_config')
      .eq('id', org.diagram.id)
      .single()
    if (readErr) throw new Error(`diagram read: ${readErr.message}`)
    const original = before.diagram_config as {
      zones: unknown[]
      labels: unknown[]
      answer: unknown[]
    }
    const edited = {
      ...original,
      zones: [...original.zones, { id: 'zx', x: 0, y: 0, w: 0.1, h: 0.1 }],
      labels: [...original.labels, { id: 'lx', text: 'Extra' }],
      answer: [...original.answer, { zone_id: 'zx', label_id: 'lx' }],
    }
    const { error: editErr } = await admin
      .from('questions')
      .update({ diagram_config: edited })
      .eq('id', org.diagram.id)
    if (editErr) throw new Error(`diagram edit: ${editErr.message}`)
    try {
      const { data } = await call()
      expect(Number(requireRpcResult<Results>(data, 'get_vfr_rt_exam_results').part3_pct)).toBe(
        submittedPart3,
      )
      const replay = await finishSeedSession(org.studentClient, sessionId)
      expect(Number(replay.part3_pct)).toBe(submittedPart3)
    } finally {
      await admin.from('questions').update({ diagram_config: original }).eq('id', org.diagram.id)
    }
  })
})

describe('complete_overdue_exam_session — Part 3 scoring via the part-score helper', () => {
  let org: Part3Org

  beforeAll(async () => {
    org = await createPart3Org('povd')
  })
  afterAll(async () => {
    await org?.cleanup()
  })

  it('scores answered ordering, diagram and multiple-choice questions of an overdue exam', async () => {
    // Fixed fixture sizes (vfr-rt-part3-helpers): 4 ordering items, 3 zones, 4 labels, 4 MC ids.
    const ord = org.ordering[0]!
    const d = org.diagram
    const mcId = org.mcIds[0]!
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: org.orgId,
        student_id: org.studentId,
        mode: 'vfr_rt_exam',
        subject_id: org.rtSubjectId,
        config: { question_ids: [ord.id, d.id, mcId] },
        total_questions: 3,
        time_limit_seconds: 1800,
        started_at: new Date(Date.now() - (1800 + 120) * 1000).toISOString(),
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`overdue session insert: ${insErr.message}`)
    const sessionId = inserted.id as string

    const rows = [
      ...ord.items.map((it, slot) => ({
        question_id: ord.id,
        response_text: it.text,
        blank_index: slot,
        is_correct: true,
      })),
      ...d.zones.map((_, z) => ({
        question_id: d.id,
        response_text: d.labels[z]!.text,
        blank_index: z,
        is_correct: z < 2,
      })),
      { question_id: mcId, selected_option_id: 'b', is_correct: true },
    ].map((r) => ({ session_id: sessionId, response_time_ms: 1000, ...r }))
    const { error: ansErr } = await admin.from('quiz_session_answers').insert(rows)
    expect(ansErr).toBeNull()

    const { data, error } = await org.studentClient.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const result = requireRpcResult<{ score_percentage: number | string; passed: boolean }>(
      data,
      'complete_overdue_exam_session',
    )
    // part3 = (1 + 2/3 + 1) / 3 = 88.89; parts 1-2 have no questions → 0; score = mean of parts.
    expect(Number(result.score_percentage)).toBe(29.63)
    expect(result.passed).toBe(false)

    const { data: session } = await admin
      .from('quiz_sessions')
      .select('ended_at, score_percentage')
      .eq('id', sessionId)
      .single()
    expect(session?.ended_at).not.toBeNull()
    expect(Number(session?.score_percentage)).toBe(29.63)

    const { data: events, error: evErr } = await admin
      .from('audit_events')
      .select('metadata')
      .eq('resource_id', sessionId)
      .eq('event_type', 'vfr_rt_exam.expired')
    expect(evErr).toBeNull()
    expect(events).toHaveLength(1)
    // toHaveLength(1) above guarantees events[0].
    expect(Number((events![0]!.metadata as { part3_pct: number | string }).part3_pct)).toBe(88.89)
  })
})
