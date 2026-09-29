/**
 * get_vfr_rt_exam_results and complete_overdue_exam_session — Part 3 ordering / diagram_label
 * (migs 20260929000500, 20260929000600): answer keys appear only after the exam ended, part 3 counts
 * the new types, and an overdue auto-completion scores them through the shared part-score helper.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requireRpcResult } from './guards'
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
    const slot = (q: typeof ord0, order: number[]) =>
      order.map((from, s) => ({
        question_id: q.id,
        selected_option_id: q.items[from]!.id,
        blank_index: s,
      }))
    const d = org.diagram
    const { data, error } = await org.studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: [
        ...org.mcIds.map((id) => ({ question_id: id, selected_option_id: 'b' })),
        ...slot(ord0, [0, 1, 2, 3]),
        ...slot(ord1, [1, 0, 2, 3]),
        {
          question_id: d.id,
          selected_option_id: d.labels[0]!.id,
          response_text: d.zones[0]!.id,
          blank_index: 0,
        },
        {
          question_id: d.id,
          selected_option_id: d.labels[1]!.id,
          response_text: d.zones[1]!.id,
          blank_index: 1,
        },
        {
          question_id: d.id,
          selected_option_id: d.labels[3]!.id,
          response_text: d.zones[2]!.id,
          blank_index: 2,
        },
      ],
    })
    if (error) throw new Error(`submit: ${error.message}`)
    submittedPart3 = Number(
      requireRpcResult<{ part3_pct: number | string }>(data, 'submit').part3_pct,
    )
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
    expect(entry!.key).toEqual({
      answer: org.diagram.answer,
      zones: org.diagram.zones,
      labels: org.diagram.labels,
    })
    expect(entry!.answers.map((a) => a.is_correct)).toEqual([true, true, false])
  })

  it('scores part 3 over multiple-choice, ordering and diagram questions, matching the submit result', async () => {
    const { data } = await call()
    const res = requireRpcResult<Results>(data, 'get_vfr_rt_exam_results')
    // (4 MC + 1 + 0.5 + 0 + 2/3) / 8 questions
    expect(Number(res.part3_pct)).toBe(77.08)
    expect(Number(res.part3_pct)).toBe(submittedPart3)
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
  })
})
