/**
 * submit_vfr_rt_exam_answers — Part 3 ordering / diagram_label grading (mig 20260929000400):
 * partial credit (correct slots|zones / items|zones), self-checks that raise invalid_answer_entry,
 * all-or-nothing rollback, and an identical replay. Only Part 3 is answered, so part1/part2 = 0.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requireRpcResult } from './guards'
import { admin } from './vfr-rt-helpers'
import type { DiagramFixture, OrderingFixture } from './vfr-rt-part3-helpers'
import { createPart3Org, forceEndSession, type Part3Org, startPart3Exam } from './vfr-rt-part3-org'

type SubmitResult = {
  session_id: string
  part1_pct: number | string
  part2_pct: number | string
  part3_pct: number | string
  passed_overall: boolean
  total_questions: number
}
type Entry = Record<string, unknown>

/** Ordering entries: slot i holds itemIds[i]. */
function orderingEntries(q: OrderingFixture, itemIds: string[]): Entry[] {
  return itemIds.map((id, slot) => ({
    question_id: q.id,
    selected_option_id: id,
    blank_index: slot,
  }))
}
/** Diagram entries: one per placement, distinct blank_index per entry (dedup key only). */
function diagramEntries(
  q: DiagramFixture,
  placements: Array<{ zone: string; label: string }>,
): Entry[] {
  return placements.map((p, i) => ({
    question_id: q.id,
    selected_option_id: p.label,
    response_text: p.zone,
    blank_index: i,
  }))
}

describe('submit_vfr_rt_exam_answers — Part 3 ordering and diagram grading', () => {
  let org: Part3Org

  const ids = (q: OrderingFixture) => q.items.map((i) => i.id)
  const mcEntries = (): Entry[] =>
    org.mcIds.map((id) => ({ question_id: id, selected_option_id: 'b' }))

  async function submit(sessionId: string, answers: Entry[]) {
    return org.studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: answers,
    })
  }
  async function rowCount(table: 'quiz_session_answers' | 'student_responses', sessionId: string) {
    const { count, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
    if (error) throw new Error(`rowCount ${table}: ${error.message}`)
    return count ?? 0
  }
  async function endedAt(sessionId: string): Promise<string | null> {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('ended_at')
      .eq('id', sessionId)
      .single()
    if (error) throw new Error(`endedAt: ${error.message}`)
    return data.ended_at as string | null
  }

  beforeAll(async () => {
    org = await createPart3Org('psub')
  })
  afterAll(async () => {
    await org?.cleanup()
  })

  it('scores Part 3 as the mean of per-question credit, counting partial ordering and diagram credit', async () => {
    const { session_id } = await startPart3Exam(org)
    const [ord0, ord1, ord2] = org.ordering as [OrderingFixture, OrderingFixture, OrderingFixture]
    const d = org.diagram
    const a = ids(ord0)
    const answers = [
      ...mcEntries(), // 4 MC correct → 4.0
      ...orderingEntries(ord0, [a[0]!, a[1]!, a[3]!, a[2]!]), // 2 of 4 slots → 0.5
      ...orderingEntries(ord1, ids(ord1)), // canonical → 1.0
      ...orderingEntries(ord2, [ids(ord2)[1]!, ids(ord2)[2]!, ids(ord2)[3]!, ids(ord2)[0]!]), // 0 of 4 → 0
      ...diagramEntries(d, [
        { zone: d.zones[0]!.id, label: d.labels[0]!.id }, // correct
        { zone: d.zones[1]!.id, label: d.labels[1]!.id }, // correct
        { zone: d.zones[2]!.id, label: d.labels[3]!.id }, // wrong (distractor)
      ]), // 2 of 3 zones → 0.6667
    ]
    const { data, error } = await submit(session_id, answers)
    expect(error).toBeNull()
    const result = requireRpcResult<SubmitResult>(data, 'submit_vfr_rt_exam_answers')
    // (4 + 0.5 + 1 + 0 + 2/3) / 8 = 0.770833…
    expect(Number(result.part3_pct)).toBe(77.08)
    expect(Number(result.part1_pct)).toBe(0)
    expect(Number(result.part2_pct)).toBe(0)
    expect(result.passed_overall).toBe(false)
    // Per-slot / per-zone rows are persisted alongside the MC rows: 4 + 4*3 + 3.
    expect(await rowCount('quiz_session_answers', session_id)).toBe(4 + 12 + 3)
    expect(await rowCount('student_responses', session_id)).toBe(4 + 12 + 3)
  })

  it('gives a single correctly placed zone one third of a diagram question, storing the server zone ordinal', async () => {
    const { session_id } = await startPart3Exam(org)
    const d = org.diagram
    const { data, error } = await submit(session_id, [
      {
        question_id: d.id,
        selected_option_id: d.labels[1]!.id,
        response_text: d.zones[1]!.id,
        blank_index: 7,
      },
    ])
    expect(error).toBeNull()
    const result = requireRpcResult<SubmitResult>(data, 'submit_vfr_rt_exam_answers')
    // (1/3) / 8 questions = 4.1666…
    expect(Number(result.part3_pct)).toBe(4.17)

    const { data: rows, error: rowsErr } = await admin
      .from('quiz_session_answers')
      .select('blank_index, is_correct')
      .eq('session_id', session_id)
      .eq('question_id', d.id)
    expect(rowsErr).toBeNull()
    // Client sent blank_index 7; the stored index is the zone's ordinal (second zone).
    expect(rows).toEqual([{ blank_index: 1, is_correct: true }])
  })

  it('rejects an ordering answer that is not a complete permutation and writes nothing', async () => {
    const { session_id } = await startPart3Exam(org)
    const q = org.ordering[0]!
    expect(await endedAt(session_id)).toBeNull()
    expect(await rowCount('quiz_session_answers', session_id)).toBe(0)

    const { error } = await submit(session_id, orderingEntries(q, ids(q).slice(0, 3)))
    expect(error?.message).toContain('invalid_answer_entry')
    expect(await rowCount('quiz_session_answers', session_id)).toBe(0)
    expect(await endedAt(session_id)).toBeNull()

    // Control: the full permutation is accepted, so the rejection was the missing item.
    const { error: okErr } = await submit(session_id, orderingEntries(q, ids(q)))
    expect(okErr).toBeNull()
    expect(await rowCount('quiz_session_answers', session_id)).toBe(4)
  })

  it('rejects a diagram answer that fills the same zone twice and writes nothing', async () => {
    const { session_id } = await startPart3Exam(org)
    const d = org.diagram
    expect(await rowCount('quiz_session_answers', session_id)).toBe(0)

    const { error } = await submit(
      session_id,
      diagramEntries(d, [
        { zone: d.zones[0]!.id, label: d.labels[0]!.id },
        { zone: d.zones[0]!.id, label: d.labels[1]!.id },
      ]),
    )
    expect(error?.message).toContain('invalid_answer_entry')
    expect(await rowCount('quiz_session_answers', session_id)).toBe(0)
    expect(await endedAt(session_id)).toBeNull()

    // Control: the same labels on distinct zones are accepted.
    const { error: okErr } = await submit(
      session_id,
      diagramEntries(d, [
        { zone: d.zones[0]!.id, label: d.labels[0]!.id },
        { zone: d.zones[1]!.id, label: d.labels[1]!.id },
      ]),
    )
    expect(okErr).toBeNull()
    expect(await rowCount('quiz_session_answers', session_id)).toBe(2)
  })

  it('rolls back the whole call when an ordering entry names an unknown item id', async () => {
    const { session_id } = await startPart3Exam(org)
    const q = org.ordering[0]!
    const mc = { question_id: org.mcIds[0]!, selected_option_id: 'b' }
    const forged = [...ids(q).slice(0, 3), 'o1deadbeef']
    expect(await rowCount('quiz_session_answers', session_id)).toBe(0)

    // The MC entry is processed BEFORE the forged ordering entry raises.
    const { error } = await submit(session_id, [mc, ...orderingEntries(q, forged)])
    expect(error).not.toBeNull()
    expect(await rowCount('quiz_session_answers', session_id)).toBe(0)
    expect(await rowCount('student_responses', session_id)).toBe(0)
    expect(await endedAt(session_id)).toBeNull()

    // Control: the MC entry alone is valid and lands, so only the rollback kept it out above.
    const { error: okErr } = await submit(session_id, [mc])
    expect(okErr).toBeNull()
    expect(await rowCount('quiz_session_answers', session_id)).toBe(1)
  })

  it('returns an identical result and writes nothing when the same completed exam is submitted again', async () => {
    const { session_id } = await startPart3Exam(org)
    const q = org.ordering[1]!
    const answers = [...mcEntries(), ...orderingEntries(q, ids(q))]
    const first = await submit(session_id, answers)
    expect(first.error).toBeNull()
    const written = await rowCount('quiz_session_answers', session_id)
    expect(written).toBe(4 + 4)

    const second = await submit(session_id, answers)
    expect(second.error).toBeNull()
    expect(second.data).toEqual(first.data)
    expect(Number((second.data as SubmitResult).part3_pct)).toBeGreaterThan(0)
    expect(await rowCount('quiz_session_answers', session_id)).toBe(written)
  })

  it('returns numeric part scores when replaying an exam that ended without a terminal audit event', async () => {
    const { session_id } = await startPart3Exam(org)
    await forceEndSession(session_id)
    const { data, error } = await submit(session_id, [])
    expect(error).toBeNull()
    const res = requireRpcResult<SubmitResult>(data, 'replay')
    expect([res.part1_pct, res.part2_pct, res.part3_pct]).toEqual([0, 0, 0])
  })
})
