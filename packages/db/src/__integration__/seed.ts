import type { SupabaseClient } from '@supabase/supabase-js'

/** Seed reference data: subject + topic + subtopic. Returns IDs. */
export async function seedReferenceData(opts: {
  admin: SupabaseClient
  subjectCode: string
  subjectName: string
  topicCode: string
  topicName: string
  subtopicCode?: string
  subtopicName?: string
}): Promise<{ subjectId: string; topicId: string; subtopicId: string | null }> {
  const { admin } = opts

  const { data: subject, error: sErr } = await admin
    .from('easa_subjects')
    .upsert(
      {
        code: opts.subjectCode,
        name: opts.subjectName,
        short: opts.subjectCode,
        sort_order: 1,
      },
      { onConflict: 'code' },
    )
    .select('id')
    .single()
  if (sErr) throw new Error(`seedSubject: ${sErr.message}`)

  const { data: topic, error: tErr } = await admin
    .from('easa_topics')
    .upsert(
      {
        subject_id: subject.id,
        code: opts.topicCode,
        name: opts.topicName,
        sort_order: 1,
      },
      { onConflict: 'subject_id,code' },
    )
    .select('id')
    .single()
  if (tErr) throw new Error(`seedTopic: ${tErr.message}`)

  let subtopicId: string | null = null
  if (opts.subtopicCode && opts.subtopicName) {
    const { data: sub, error: stErr } = await admin
      .from('easa_subtopics')
      .upsert(
        {
          topic_id: topic.id,
          code: opts.subtopicCode,
          name: opts.subtopicName,
          sort_order: 1,
        },
        { onConflict: 'topic_id,code' },
      )
      .select('id')
      .single()
    if (stErr) throw new Error(`seedSubtopic: ${stErr.message}`)
    subtopicId = sub.id
  }

  return { subjectId: subject.id, topicId: topic.id, subtopicId }
}

/** Seed a question bank + questions. Returns bank ID and question IDs. */
export async function seedQuestions(opts: {
  admin: SupabaseClient
  orgId: string
  createdBy: string
  subjectId: string
  topicId: string
  subtopicId?: string | null
  count: number
}): Promise<{ bankId: string; questionIds: string[] }> {
  const { admin, orgId, createdBy, subjectId, topicId, subtopicId } = opts

  // 1:1 org:bank invariant (mig 062) — reuse the existing bank if one exists,
  // otherwise create one. Mirrors production lookup in insert-question.ts.
  // Service-role bypasses RLS, so the soft-delete filter must be applied
  // manually (production gets it from the authenticated-user RLS policy).
  const { data: existingBank, error: lookupErr } = await admin
    .from('question_banks')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (lookupErr) throw new Error(`seedBank lookup: ${lookupErr.message}`)

  let bankId: string
  if (existingBank) {
    bankId = existingBank.id
  } else {
    const { data: bank, error: bErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `Test Bank ${Date.now()}`,
        created_by: createdBy,
      })
      .select('id')
      .single()
    if (bErr) throw new Error(`seedBank: ${bErr.message}`)
    bankId = bank.id
  }

  const questions = Array.from({ length: opts.count }, (_, i) => ({
    organization_id: orgId,
    bank_id: bankId,
    subject_id: subjectId,
    topic_id: topicId,
    subtopic_id: subtopicId ?? null,
    question_text: `Test question ${i + 1}?`,
    options: [
      { id: 'a', text: `Option A ${i}` },
      { id: 'b', text: `Option B ${i}` },
      { id: 'c', text: `Option C ${i}` },
      { id: 'd', text: `Option D ${i}` },
    ],
    // MC answer key now lives in its own REVOKE-gated column (#823, mig 111).
    // 'b' is the correct option for every seeded question.
    correct_option_id: 'b',
    explanation_text: `Explanation for question ${i + 1}`,
    difficulty: 'medium',
    status: 'active',
    created_by: createdBy,
  }))

  const { data, error: qErr } = await admin.from('questions').insert(questions).select('id')
  if (qErr) throw new Error(`seedQuestions: ${qErr.message}`)
  // Runtime guard pairs with the implicit DB-result shape assumption (code-style.md §5):
  // a null/non-array response would otherwise throw an opaque error on .map().
  if (!Array.isArray(data)) throw new Error('seedQuestions: unexpected response shape')

  return {
    bankId,
    questionIds: (data as Array<{ id: string }>).map((q) => q.id),
  }
}
