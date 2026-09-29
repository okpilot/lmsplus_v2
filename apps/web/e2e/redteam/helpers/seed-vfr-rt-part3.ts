/**
 * VFR RT Part 3 fixture: >= 2 active questions in EACH easa_subtopics row under the
 * shared RT / P3_MC topic, any of multiple_choice / ordering / diagram_label —
 * the composition start_vfr_rt_exam_session requires.
 *
 * easa_subtopics has no org column, so the rows are shared reference data: they are
 * resolved BY CODE here and never inserted, updated or deleted.
 *
 * Every pool question of a type is identical in content, so a correct `p_answers`
 * entry needs no per-question bookkeeping (see buildPart3Answer):
 *  - ordering: items are the canonical texts below, ids derived from the text.
 *  - diagram_label: one fixed config; the answer key is the zone -> label map below.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveContentId } from '../../../scripts/content-ids'

/** Prefix on question_text of every pool question — cleanupVfrRtPool matches it with LIKE. */
export const VFR_RT_POOL_MARKER = '[E2E-VFRRT]'
/** Correct option id for every multiple_choice question in the pool. */
export const VFR_RT_MC_CORRECT = 'b'
/** Questions seeded per Part 3 subtopic (the RPC requires 2 and draws 2). */
const VFR_RT_P3_PER_SUBTOPIC = 2
/** Number of seeded Part 3 subtopics (mig 097: NUMBERS, EMERGENCY, POSREP, PATTERN). */
const VFR_RT_P3_SUBTOPIC_COUNT = 4
/** Part 3 question count of a started exam: 2 per subtopic. */
export const VFR_RT_P3_COUNT = VFR_RT_P3_PER_SUBTOPIC * VFR_RT_P3_SUBTOPIC_COUNT

/** Stored (canonical) order of every pool ordering question. */
const ORDERING_TEXTS = ['MAYDAY MAYDAY MAYDAY', 'Golf Bravo Charlie', 'engine failure', 'position']
const ORDERING_ITEMS = ORDERING_TEXTS.map((text) => ({ id: deriveContentId('o', [text]), text }))

// Zone ids and label ids are disjoint; every zone's canonical label is distinct; one
// label is an unused distractor (is_valid_diagram_config).
const DIAGRAM_ZONES = [
  { id: 'zone-nw', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
  { id: 'zone-ne', x: 0.6, y: 0.1, w: 0.2, h: 0.2 },
  { id: 'zone-sw', x: 0.1, y: 0.6, w: 0.2, h: 0.2 },
]
const DIAGRAM_LABELS = [
  { id: 'lbl-alpha', text: 'Upwind Leg' },
  { id: 'lbl-bravo', text: 'Crosswind Leg' },
  { id: 'lbl-charlie', text: 'Downwind Leg' },
  { id: 'lbl-distract', text: 'Base Leg (unused)' },
]
const DIAGRAM_ANSWER = [
  { zone_id: 'zone-nw', label_id: 'lbl-alpha' },
  { zone_id: 'zone-ne', label_id: 'lbl-bravo' },
  { zone_id: 'zone-sw', label_id: 'lbl-charlie' },
]
const DIAGRAM_CONFIG = {
  image_ref: 'rwy-27-09-lh-pattern',
  zones: DIAGRAM_ZONES,
  labels: DIAGRAM_LABELS,
  answer: DIAGRAM_ANSWER,
}

type Part3Type = 'multiple_choice' | 'ordering' | 'diagram_label'

/** Types seeded per subtopic code; a subtopic not listed gets multiple_choice only. */
const TYPES_BY_SUBTOPIC: Record<string, Part3Type[]> = {
  P3_NUMBERS: ['multiple_choice', 'multiple_choice'],
  P3_EMERGENCY: ['multiple_choice', 'ordering'],
  P3_POSREP: ['multiple_choice', 'multiple_choice'],
  P3_PATTERN: ['multiple_choice', 'diagram_label'],
}

type Part3Base = {
  orgId: string
  bankId: string
  subjectId: string
  topicId: string
  createdBy: string
}

type Part3Ids = { mcIds: string[]; orderingIds: string[]; diagramIds: string[] }

// Every row carries the SAME key set: a batched PostgREST insert nulls a key a row omits
// (it does not apply the column DEFAULT), and ordering_items is NOT NULL.
const NEUTRAL_COLUMNS = {
  options: [],
  blanks_config: [],
  correct_option_id: null,
  ordering_items: [],
  diagram_config: null,
}
const TYPE_COLUMNS: Record<Part3Type, (i: number) => Record<string, unknown>> = {
  multiple_choice: (i) => ({
    options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Option ${id.toUpperCase()} ${i}` })),
    // MC answer key in its own REVOKE-gated column (#823, mig 111).
    correct_option_id: VFR_RT_MC_CORRECT,
  }),
  ordering: () => ({ ordering_items: ORDERING_ITEMS }),
  diagram_label: () => ({ diagram_config: DIAGRAM_CONFIG }),
}

/** One row per (subtopic, type) pair — pure, no I/O. */
export function buildPart3Rows(
  base: Part3Base,
  subtopics: ReadonlyArray<{ id: string; code: string }>,
): Array<{ type: Part3Type; row: Record<string, unknown> }> {
  return subtopics.flatMap((sub) => {
    const types =
      TYPES_BY_SUBTOPIC[sub.code] ?? Array(VFR_RT_P3_PER_SUBTOPIC).fill('multiple_choice')
    return types.map((type, i) => ({
      type,
      row: {
        organization_id: base.orgId,
        bank_id: base.bankId,
        subject_id: base.subjectId,
        topic_id: base.topicId,
        subtopic_id: sub.id,
        question_text: `${VFR_RT_POOL_MARKER} P3 ${sub.code} ${type} ${i}?`,
        explanation_text: `P3 explanation ${sub.code} ${i}`,
        question_type: type,
        difficulty: 'medium',
        status: 'active',
        created_by: base.createdBy,
        ...NEUTRAL_COLUMNS,
        ...TYPE_COLUMNS[type](i),
      },
    }))
  })
}

/** Resolve the P3_MC subtopics by topic (reference data, read-only). */
async function resolveP3Subtopics(
  admin: SupabaseClient,
  topicId: string,
): Promise<Array<{ id: string; code: string }>> {
  const { data, error } = await admin
    .from('easa_subtopics')
    .select('id, code')
    .eq('topic_id', topicId)
  if (error) throw new Error(`resolveP3Subtopics: ${error.message}`)
  if (!Array.isArray(data) || data.length === 0)
    throw new Error('resolveP3Subtopics: no P3_MC subtopics — run mig 097')
  return data as Array<{ id: string; code: string }>
}

/**
 * Seed Part 3 for the fixture's own org: >= 2 questions in every real P3_MC subtopic,
 * including at least one ordering and one diagram_label. `insert` returns created ids
 * in row order.
 */
export async function seedPart3Pool(opts: {
  admin: SupabaseClient
  base: Part3Base
  insert: (rows: Record<string, unknown>[]) => Promise<string[]>
}): Promise<Part3Ids> {
  const subtopics = await resolveP3Subtopics(opts.admin, opts.base.topicId)
  const built = buildPart3Rows(opts.base, subtopics)
  const ids = await opts.insert(built.map((b) => b.row))
  const idsOf = (type: Part3Type) => ids.filter((_, i) => built[i]?.type === type)
  return {
    mcIds: idsOf('multiple_choice'),
    orderingIds: idsOf('ordering'),
    diagramIds: idsOf('diagram_label'),
  }
}

/** Correct `p_answers` entries for one Part 3 question, or null when the type is not Part 3. */
export function buildPart3Answer(question: {
  id: string
  question_type: string
}): Array<Record<string, unknown>> | null {
  const base = { question_id: question.id, response_time_ms: 1000 }
  if (question.question_type === 'multiple_choice')
    return [{ ...base, selected_option_id: VFR_RT_MC_CORRECT }]
  if (question.question_type === 'ordering')
    // One entry per slot, item ids in canonical stored order.
    return ORDERING_ITEMS.map((item, slot) => ({
      ...base,
      selected_option_id: item.id,
      blank_index: slot,
    }))
  if (question.question_type === 'diagram_label')
    // One entry per zone: label id + zone id, each with a distinct blank_index.
    return DIAGRAM_ANSWER.map((a, i) => ({
      ...base,
      selected_option_id: a.label_id,
      response_text: a.zone_id,
      blank_index: i,
    }))
  return null
}

/** Answer-key shape get_vfr_rt_exam_results returns for the pool's ordering question. */
export const VFR_RT_ORDERING_KEY_IDS = ORDERING_ITEMS.map((i) => i.id)
/** Zone -> label answer key the results RPC returns for the pool's diagram question. */
export const VFR_RT_DIAGRAM_ANSWER = DIAGRAM_ANSWER

const CORRECT_ROWS_BY_TYPE: Record<Part3Type, number> = {
  multiple_choice: 1,
  ordering: ORDERING_ITEMS.length,
  diagram_label: DIAGRAM_ANSWER.length,
}
/** Correct answer rows a fully-correct Part 3 writes (one per MC, slot, zone). */
export const VFR_RT_P3_CORRECT_ROWS = Object.values(TYPES_BY_SUBTOPIC)
  .flat()
  .reduce((n, type) => n + CORRECT_ROWS_BY_TYPE[type], 0)
