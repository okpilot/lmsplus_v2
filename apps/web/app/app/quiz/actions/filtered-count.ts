'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { QUESTION_TYPES } from '@/app/app/_types/session'
import { rpc } from '@/lib/supabase-rpc'

// Extracted from lookup.ts (§1 — lookup.ts was over the 100-line Server Action cap).
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
  questionType: z.enum(QUESTION_TYPES).optional(),
})

export type FilteredCountResult = {
  count: number
  byTopic: Record<string, number>
  bySubtopic: Record<string, number>
  error?: 'auth'
}

type CountRpcRow = { topic_id: string; subtopic_id: string | null; n: number | string }
type CountAggregate = {
  count: number
  byTopic: Record<string, number>
  bySubtopic: Record<string, number>
}

// Per-row §5 guard: the `rpc<…>` cast is a TS assertion only, so a malformed row's
// NaN / non-string topic_id must not poison count/byTopic/bySubtopic.
function aggregateCountRows(rows: CountRpcRow[]): CountAggregate {
  let count = 0
  const byTopic: Record<string, number> = {}
  const bySubtopic: Record<string, number> = {}
  for (const r of rows) {
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
  const { data, error } = await rpc<CountRpcRow[]>(supabase, 'get_filtered_question_counts', {
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

  return aggregateCountRows(data)
}
