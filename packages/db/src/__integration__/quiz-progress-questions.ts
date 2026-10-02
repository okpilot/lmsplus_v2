import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRpcResult } from './guards'
import { orderingItem } from './ordering-item-id'
import { seedQuestions, type seedReferenceData } from './seed'

export const ORDER_ITEMS = [orderingItem('first call'), orderingItem('second call')]

type Refs = Awaited<ReturnType<typeof seedReferenceData>>

async function insertQuestion(admin: SupabaseClient, row: Record<string, unknown>) {
  const { data, error } = await admin.from('questions').insert(row).select('id').single()
  if (error) throw new Error(`insertQuestion: ${error.message}`)
  return requireRpcResult<{ id: string }>(data, 'insertQuestion').id
}

export type TypedQuestionIds = {
  /** Five multiple_choice questions (correct option 'b'). */
  mcIds: string[]
  shortId: string
  dialogId: string
  orderingId: string
  diagramId: string
}

/** Five multiple_choice questions plus one question of every other type. */
export async function seedTypedQuestions(opts: {
  admin: SupabaseClient
  orgId: string
  adminId: string
  refs: Refs
}): Promise<TypedQuestionIds> {
  const { admin, orgId, adminId, refs } = opts
  const seeded = await seedQuestions({
    admin,
    orgId,
    createdBy: adminId,
    subjectId: refs.subjectId,
    topicId: refs.topicId,
    count: 5,
  })
  const base = {
    organization_id: orgId,
    bank_id: seeded.bankId,
    subject_id: refs.subjectId,
    topic_id: refs.topicId,
    subtopic_id: null,
    difficulty: 'medium',
    status: 'active',
    created_by: adminId,
  }
  const shortId = await insertQuestion(admin, {
    ...base,
    question_type: 'short_answer',
    question_text: 'Acknowledge?',
    canonical_answer: 'wilco',
    explanation_text: 'SA explanation',
  })
  const dialogId = await insertQuestion(admin, {
    ...base,
    question_type: 'dialog_fill',
    question_text: 'Dialog',
    dialog_template: '[atc] {{0|cleared}} to land.',
    blanks_config: [{ index: 0, canonical: 'cleared', synonyms: [] }],
    explanation_text: 'DF explanation',
  })
  const orderingId = await insertQuestion(admin, {
    ...base,
    question_type: 'ordering',
    question_text: 'Sequence',
    ordering_items: ORDER_ITEMS,
    explanation_text: 'Ordering explanation',
  })
  const diagramId = await insertQuestion(admin, {
    ...base,
    question_type: 'diagram_label',
    question_text: 'Label the circuit',
    diagram_config: {
      image_ref: 'rwy-27-09-lh-pattern',
      zones: [{ id: 'zone-1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 }],
      labels: [{ id: 'lbl-1', text: 'Downwind' }],
      answer: [{ zone_id: 'zone-1', label_id: 'lbl-1' }],
    },
    explanation_text: 'Diagram explanation',
  })
  return { mcIds: seeded.questionIds, shortId, dialogId, orderingId, diagramId }
}
