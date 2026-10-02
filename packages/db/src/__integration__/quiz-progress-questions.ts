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
  const base = baseRow({ orgId, adminId, bankId: seeded.bankId, refs })
  const ids: Record<string, string> = {}
  for (const [key, spec] of Object.entries(TYPED_SPECS)) {
    ids[key] = await insertQuestion(admin, { ...base, ...spec })
  }
  return {
    mcIds: seeded.questionIds,
    shortId: ids.shortId ?? '',
    dialogId: ids.dialogId ?? '',
    orderingId: ids.orderingId ?? '',
    diagramId: ids.diagramId ?? '',
  }
}

function baseRow(o: { orgId: string; adminId: string; bankId: string; refs: Refs }) {
  return {
    organization_id: o.orgId,
    bank_id: o.bankId,
    subject_id: o.refs.subjectId,
    topic_id: o.refs.topicId,
    subtopic_id: null,
    difficulty: 'medium',
    status: 'active',
    created_by: o.adminId,
  }
}

const TYPED_SPECS: Record<string, Record<string, unknown>> = {
  shortId: {
    question_type: 'short_answer',
    question_text: 'Acknowledge?',
    canonical_answer: 'wilco',
    explanation_text: 'SA explanation',
  },
  dialogId: {
    question_type: 'dialog_fill',
    question_text: 'Dialog',
    dialog_template: '[atc] {{0|cleared}} to land.',
    blanks_config: [{ index: 0, canonical: 'cleared', synonyms: [] }],
    explanation_text: 'DF explanation',
  },
  orderingId: {
    question_type: 'ordering',
    question_text: 'Sequence',
    ordering_items: ORDER_ITEMS,
    explanation_text: 'Ordering explanation',
  },
  diagramId: {
    question_type: 'diagram_label',
    question_text: 'Label the circuit',
    diagram_config: {
      image_ref: 'rwy-27-09-lh-pattern',
      zones: [{ id: 'zone-1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 }],
      labels: [{ id: 'lbl-1', text: 'Downwind' }],
      answer: [{ zone_id: 'zone-1', label_id: 'lbl-1' }],
    },
    explanation_text: 'Diagram explanation',
  },
}
