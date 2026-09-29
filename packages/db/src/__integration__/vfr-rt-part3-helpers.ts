/**
 * Part 3 fixtures for the VFR RT exam integration suites (2 questions sampled per subtopic,
 * mig 20260929000200). Split from vfr-rt-helpers.ts to keep both under the helper cap. Not a test
 * file — Vitest does not collect it.
 */
import { orderingItem } from './ordering-item-id'
import { admin, insertMcQuestion, suffix } from './vfr-rt-helpers'

// ─── Part 3 subtopics (mig 20260929000200: 2 questions sampled per subtopic) ──

/** The seeded P3_MC subtopics in sort_order. Resolved BY CODE, never mutated by tests. */
export const P3_SUBTOPIC_CODES = ['P3_NUMBERS', 'P3_EMERGENCY', 'P3_POSREP', 'P3_PATTERN'] as const
export type P3SubtopicCode = (typeof P3_SUBTOPIC_CODES)[number]

/** Resolve the four seeded P3_MC subtopic ids by code. Throws if any is missing. */
export async function getP3Subtopics(p3TopicId: string): Promise<Record<P3SubtopicCode, string>> {
  const { data, error } = await admin
    .from('easa_subtopics')
    .select('id, code')
    .eq('topic_id', p3TopicId)
    .in('code', [...P3_SUBTOPIC_CODES])
  if (error) throw new Error(`getP3Subtopics: ${error.message}`)
  const byCode = Object.fromEntries(
    (data ?? []).map((r: { id: string; code: string }) => [r.code, r.id]),
  )
  for (const code of P3_SUBTOPIC_CODES) {
    if (!byCode[code])
      throw new Error(`getP3Subtopics: subtopic ${code} missing — run the seed migrations`)
  }
  return byCode as Record<P3SubtopicCode, string>
}

type OrgFixture = { orgId: string; bankId: string; adminId: string; rtSubjectId: string }

/**
 * Seed `perSubtopic` (default 2) multiple_choice questions in EACH seeded P3 subtopic for the
 * caller's org. Returns the ids per subtopic code. Satisfies start_vfr_rt_exam_session's
 * 2-per-subtopic rule with a fully deterministic Part 3 (8 MC).
 */
export async function seedP3Pool(
  opts: OrgFixture & { p3TopicId: string; idxBase: number; perSubtopic?: number },
): Promise<Record<P3SubtopicCode, string[]>> {
  const subs = await getP3Subtopics(opts.p3TopicId)
  const per = opts.perSubtopic ?? 2
  const out = {} as Record<P3SubtopicCode, string[]>
  let idx = opts.idxBase
  for (const code of P3_SUBTOPIC_CODES) {
    out[code] = []
    for (let i = 0; i < per; i++) {
      out[code].push(await insertMcQuestion({ ...opts, subtopicId: subs[code], idx: idx++ }))
    }
  }
  return out
}

export type OrderingFixture = { id: string; items: Array<{ id: string; text: string }> }

/** Insert an active ordering question; `items` is the canonical order (stored array order). */
export async function insertOrderingQuestion(
  opts: OrgFixture & { topicId: string; subtopicId: string; idx: number; itemCount?: number },
): Promise<OrderingFixture> {
  const items = Array.from({ length: opts.itemCount ?? 4 }, (_, i) =>
    orderingItem(`step ${i + 1} of sequence ${opts.idx} ${suffix}`),
  )
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: opts.orgId,
      bank_id: opts.bankId,
      subject_id: opts.rtSubjectId,
      topic_id: opts.topicId,
      subtopic_id: opts.subtopicId,
      question_text: `ORD question ${opts.idx} ${suffix}?`,
      explanation_text: `ORD explanation ${opts.idx}`,
      question_type: 'ordering',
      ordering_items: items,
      difficulty: 'medium',
      status: 'active',
      created_by: opts.adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertOrderingQuestion: ${error.message}`)
  return { id: data.id as string, items }
}

export type DiagramFixture = {
  id: string
  zones: Array<{ id: string; x: number; y: number; w: number; h: number }>
  labels: Array<{ id: string; text: string }>
  answer: Array<{ zone_id: string; label_id: string }>
}

/** Insert an active diagram_label question with 3 zones and 4 labels (1 distractor). */
export async function insertDiagramQuestion(
  opts: OrgFixture & { topicId: string; subtopicId: string; idx: number },
): Promise<DiagramFixture> {
  const n = `${opts.idx}-${suffix}`
  const zones = [
    { id: `zone-a-${n}`, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    { id: `zone-b-${n}`, x: 0.6, y: 0.1, w: 0.2, h: 0.2 },
    { id: `zone-c-${n}`, x: 0.1, y: 0.6, w: 0.2, h: 0.2 },
  ]
  const labels = [
    { id: `lbl-one-${n}`, text: `Upwind ${opts.idx}` },
    { id: `lbl-two-${n}`, text: `Crosswind ${opts.idx}` },
    { id: `lbl-three-${n}`, text: `Downwind ${opts.idx}` },
    { id: `lbl-four-${n}`, text: `Base ${opts.idx} (unused)` },
  ]
  const answer = [
    { zone_id: zones[0]!.id, label_id: labels[0]!.id },
    { zone_id: zones[1]!.id, label_id: labels[1]!.id },
    { zone_id: zones[2]!.id, label_id: labels[2]!.id },
  ]
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: opts.orgId,
      bank_id: opts.bankId,
      subject_id: opts.rtSubjectId,
      topic_id: opts.topicId,
      subtopic_id: opts.subtopicId,
      question_text: `DIAG question ${opts.idx} ${suffix}?`,
      explanation_text: `DIAG explanation ${opts.idx}`,
      question_type: 'diagram_label',
      diagram_config: { image_ref: `rwy-pattern-${opts.idx}`, zones, labels, answer },
      difficulty: 'medium',
      status: 'active',
      created_by: opts.adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertDiagramQuestion: ${error.message}`)
  return { id: data.id as string, zones, labels, answer }
}

/**
 * Create a PRIVATE Part 3 topic under the RT subject with the given subtopic codes (unique per
 * run). Shared P3_MC rows are never touched; reach it via exam_configs.parts_config.part3.topic_code.
 */
export async function createPrivateP3Topic(opts: {
  rtSubjectId: string
  tag: string
  subtopicCodes: string[]
}): Promise<{ topicId: string; topicCode: string; subtopicIds: Record<string, string> }> {
  const topicCode = `P3_PRIV_${opts.tag}_${suffix}`
  const { data: topic, error } = await admin
    .from('easa_topics')
    .insert({
      subject_id: opts.rtSubjectId,
      code: topicCode,
      name: `Private P3 ${suffix}`,
      sort_order: 990,
    })
    .select('id')
    .single()
  if (error) throw new Error(`createPrivateP3Topic topic: ${error.message}`)
  const subtopicIds: Record<string, string> = {}
  for (const [i, code] of opts.subtopicCodes.entries()) {
    const { data: st, error: stErr } = await admin
      .from('easa_subtopics')
      .insert({ topic_id: topic.id, code, name: code, sort_order: i + 1 })
      .select('id')
      .single()
    if (stErr) throw new Error(`createPrivateP3Topic subtopic ${code}: ${stErr.message}`)
    subtopicIds[code] = st.id as string
  }
  return { topicId: topic.id as string, topicCode, subtopicIds }
}

/**
 * Remove a private topic created by createPrivateP3Topic. easa_* reference tables carry no
 * deleted_at; run AFTER cleanupTestData removed the questions and exam_configs that reference them.
 */
export async function removePrivateP3Topic(topicId: string | undefined): Promise<void> {
  if (!topicId) return
  const { error: stErr } = await admin.from('easa_subtopics').delete().eq('topic_id', topicId)
  if (stErr) throw new Error(`removePrivateP3Topic subtopics: ${stErr.message}`)
  const { error } = await admin.from('easa_topics').delete().eq('id', topicId)
  if (error) throw new Error(`removePrivateP3Topic topic: ${error.message}`)
}
