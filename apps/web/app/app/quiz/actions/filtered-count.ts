'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'

// Extracted from lookup.ts (code-style.md §1 same-commit extraction — lookup.ts was
// already over the 100-line Server Action cap and the RT type-filter (Slice 3) added
// lines to its questionType enum).
const FilteredCountSchema = z.object({
  subjectId: z.uuid(),
  topicIds: z.array(z.uuid()).optional(),
  subtopicIds: z.array(z.uuid()).optional(),
  filters: z.array(z.enum(['all', 'unseen', 'incorrect', 'flagged'])).default(['all']),
  calcMode: z.enum(['all', 'only', 'exclude']).default('all'),
  imageMode: z.enum(['all', 'only', 'exclude']).default('all'),
  // Study/Discovery counts only multiple_choice questions so the slider max /
  // Start-button / count badge match the MC-only fetch (startStudy). Omitted on
  // the quiz/exam count paths → null = no type restriction (#1008). The RT setup's
  // single-select type filter (Slice 3) can pass any of the 5 DB question_type
  // values — the RPC filters `q.question_type = p_question_type` generically.
  questionType: z
    .enum(['multiple_choice', 'short_answer', 'dialog_fill', 'ordering', 'diagram_label'])
    .optional(),
})

export type FilteredCountResult = {
  count: number
  byTopic: Record<string, number>
  bySubtopic: Record<string, number>
  error?: 'auth'
}

export async function getFilteredCount(input: unknown): Promise<FilteredCountResult> {
  const empty: FilteredCountResult = { count: 0, byTopic: {}, bySubtopic: {} }
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { ...empty, error: 'auth' }

  let parsed: z.infer<typeof FilteredCountSchema>
  try {
    parsed = FilteredCountSchema.parse(input)
  } catch {
    console.error('[getFilteredCount] Invalid input')
    return empty
  }
  const { subjectId, topicIds, subtopicIds, filters, calcMode, imageMode, questionType } = parsed

  // undefined → null to RPC = unconstrained (whole subject pool); [] → empty array = match nothing (topic_id = ANY('{}') is always false).
  // p_calc_mode / p_has_image are literal enums the RPC reads directly ('all' = unrestricted via CASE ELSE) — pass them through without stripping.
  // p_question_type: 'multiple_choice' on the Study/Discovery path, a specific type on the RT filter path, null (no restriction) on the quiz/exam paths (#1008).
  const { data, error } = await rpc<
    { topic_id: string; subtopic_id: string | null; n: number | string }[]
  >(supabase, 'get_filtered_question_counts', {
    p_subject_id: subjectId,
    p_topic_ids: topicIds ?? null,
    p_subtopic_ids: subtopicIds ?? null,
    p_filters: filters.filter((f) => f !== 'all'),
    p_calc_mode: calcMode,
    p_has_image: imageMode,
    p_question_type: questionType ?? null,
  })
  if (error) {
    console.error('[getFilteredCount] get_filtered_question_counts error:', error.message)
    return empty
  }
  if (!Array.isArray(data)) return empty

  // Per-row guard required by code-style.md §5 — the `rpc<…>` cast is a TS
  // assertion only. Skip rows whose topic_id isn't a string or whose n doesn't
  // coerce to a finite number; otherwise NaN would poison count/byTopic and a
  // non-string topic_id would index into the record under a coerced key.
  let count = 0
  const byTopic: Record<string, number> = {}
  const bySubtopic: Record<string, number> = {}
  for (const r of data) {
    if (!r || typeof r !== 'object') continue
    const topicId = (r as { topic_id?: unknown }).topic_id
    const subtopicId = (r as { subtopic_id?: unknown }).subtopic_id
    const n = Number((r as { n?: unknown }).n)
    if (typeof topicId !== 'string' || !Number.isFinite(n)) continue
    count += n
    byTopic[topicId] = (byTopic[topicId] ?? 0) + n
    if (typeof subtopicId === 'string') {
      bySubtopic[subtopicId] = (bySubtopic[subtopicId] ?? 0) + n
    }
  }
  return { count, byTopic, bySubtopic }
}
