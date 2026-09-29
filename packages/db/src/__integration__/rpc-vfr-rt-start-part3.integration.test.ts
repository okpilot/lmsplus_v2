/**
 * start_vfr_rt_exam_session — Part 3 composition (mig 20260929000200): 2 random questions from EACH
 * easa_subtopics row of the Part 3 topic, grouped in subtopic sort_order; a short subtopic or a
 * topic with no subtopics refuses to start. Shortfall / zero-subtopic cases use a PRIVATE topic
 * reached via exam_configs.parts_config.part3.topic_code — shared P3_MC rows are never mutated.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, ensureBank, insertMcQuestion } from './vfr-rt-helpers'
import { createPrivateP3Topic, removePrivateP3Topic, seedP3Pool } from './vfr-rt-part3-helpers'
import { createPart3Org, forceEndSession, type Part3Org, startPart3Exam } from './vfr-rt-part3-org'

const P3_ORDER = [
  'P3_NUMBERS',
  'P3_NUMBERS',
  'P3_EMERGENCY',
  'P3_EMERGENCY',
  'P3_POSREP',
  'P3_POSREP',
  'P3_PATTERN',
  'P3_PATTERN',
]

describe('start_vfr_rt_exam_session — Part 3 per-subtopic sampling', () => {
  let org: Part3Org

  beforeAll(async () => {
    org = await createPart3Org('start')
  })
  afterAll(async () => {
    await org?.cleanup()
  })

  it('freezes Part 3 as exactly 2 questions per subtopic, grouped in subtopic order', async () => {
    const started = await startPart3Exam(org)
    try {
      const p3 = started.question_ids.slice(started.parts.p2_end)
      // Non-vacuous: Part 3 is populated and every id is one of the seeded subtopic questions.
      expect(p3).toHaveLength(8)
      expect(p3.every((id) => org.subtopicOf[id] !== undefined)).toBe(true)
      expect(p3.map((id) => org.subtopicOf[id])).toEqual(P3_ORDER)
      expect(new Set(p3).size).toBe(8)
      expect(started.parts).toEqual({ p1_end: 8, p2_end: 17, p3_end: 25 })
    } finally {
      await forceEndSession(started.session_id)
    }
  })

  it('draws a different pair when a subtopic holds more than two questions, always 2 per subtopic', async () => {
    // One extra MC per subtopic → each subtopic samples 2 of 3 (3 possible pairs).
    const bankId = await ensureBank(org.orgId, org.adminId)
    const extra = await seedP3Pool({
      orgId: org.orgId,
      bankId,
      adminId: org.adminId,
      rtSubjectId: org.rtSubjectId,
      p3TopicId: org.p3TopicId,
      idxBase: 100,
      perSubtopic: 1,
    })
    const codeOf = (id: string): string | undefined =>
      org.subtopicOf[id] ?? Object.entries(extra).find(([, ids]) => ids.includes(id))?.[0]
    const numbersPairs = new Set<string>()
    for (let run = 0; run < 12; run++) {
      const started = await startPart3Exam(org)
      try {
        const p3 = started.question_ids.slice(started.parts.p2_end)
        expect(p3.map(codeOf)).toEqual(P3_ORDER)
        numbersPairs.add(p3.slice(0, 2).sort().join('|'))
      } finally {
        await forceEndSession(started.session_id)
      }
    }
    // 3 possible pairs over 12 runs: a fixed pick would collapse to one.
    expect(numbersPairs.size).toBeGreaterThan(1)
  })
})

describe('start_vfr_rt_exam_session — Part 3 refusal', () => {
  let org: Part3Org
  const privateTopicIds: string[] = []

  beforeAll(async () => {
    org = await createPart3Org('refuse')
  })
  afterAll(async () => {
    await org?.cleanup()
    for (const id of privateTopicIds) await removePrivateP3Topic(id)
  })

  async function pointConfigAt(topicCode: string | null): Promise<void> {
    const { data, error } = await admin
      .from('exam_configs')
      .update({ parts_config: topicCode ? { part3: { topic_code: topicCode } } : {} })
      .eq('organization_id', org.orgId)
      .select('id')
    if (error) throw new Error(`pointConfigAt: ${error.message}`)
    expect(data).toHaveLength(1)
  }

  function parseDetail(details: string | undefined): Record<string, unknown> {
    if (!details) throw new Error('expected DETAIL on the raise')
    return JSON.parse(details) as Record<string, unknown>
  }

  it('raises with a DETAIL naming the short subtopic, its count and the need', async () => {
    const priv = await createPrivateP3Topic({
      rtSubjectId: org.rtSubjectId,
      tag: 'short',
      subtopicCodes: ['ZZ_FULL', 'ZZ_SHORT'],
    })
    privateTopicIds.push(priv.topicId)
    const bankId = await ensureBank(org.orgId, org.adminId)
    const base = {
      orgId: org.orgId,
      bankId,
      adminId: org.adminId,
      rtSubjectId: org.rtSubjectId,
      p3TopicId: priv.topicId,
    }
    await insertMcQuestion({ ...base, subtopicId: priv.subtopicIds.ZZ_FULL, idx: 300 })
    await insertMcQuestion({ ...base, subtopicId: priv.subtopicIds.ZZ_FULL, idx: 301 })
    await insertMcQuestion({ ...base, subtopicId: priv.subtopicIds.ZZ_SHORT, idx: 302 })
    await pointConfigAt(priv.topicCode)

    const { error } = await org.studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: org.rtSubjectId,
    })
    expect(error?.message).toContain('insufficient_questions_for_vfr_rt_exam')
    expect(parseDetail(error?.details)).toEqual({
      p1_have: 8,
      p2_have: 9,
      p3_have: 3,
      p3_subtopics: 2,
      p3_short: [{ subtopic: 'ZZ_SHORT', have: 1, need: 2 }],
    })
    // No half-built session was left behind.
    const { data: sessions } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', org.studentId)
      .eq('mode', 'vfr_rt_exam')
    expect(sessions).toHaveLength(0)

    // Control: topping the short subtopic up to 2 lets the same config start, with 2 x 2 Part 3.
    await insertMcQuestion({ ...base, subtopicId: priv.subtopicIds.ZZ_SHORT, idx: 303 })
    const started = await startPart3Exam(org)
    try {
      expect(started.parts).toEqual({ p1_end: 8, p2_end: 17, p3_end: 21 })
      expect(started.question_ids).toHaveLength(21)
    } finally {
      await forceEndSession(started.session_id)
    }
  })

  it('refuses to start a Part-3-less exam when the Part 3 topic has no subtopics', async () => {
    const priv = await createPrivateP3Topic({
      rtSubjectId: org.rtSubjectId,
      tag: 'empty',
      subtopicCodes: [],
    })
    privateTopicIds.push(priv.topicId)
    await pointConfigAt(priv.topicCode)

    const { error } = await org.studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: org.rtSubjectId,
    })
    expect(error?.message).toContain('insufficient_questions_for_vfr_rt_exam')
    expect(parseDetail(error?.details)).toMatchObject({
      p3_have: 0,
      p3_subtopics: 0,
      p3_short: [],
    })

    // Control: pointing back at the default topic starts, so the refusal came from the empty topic.
    await pointConfigAt(null)
    const started = await startPart3Exam(org)
    try {
      expect(started.parts.p3_end).toBe(25)
    } finally {
      await forceEndSession(started.session_id)
    }
  })
})
