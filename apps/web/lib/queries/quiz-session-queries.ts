import { createServerSupabaseClient } from '@repo/db/server'
import type { CalcMode } from '@/app/app/quiz/types'
import { rpc } from '@/lib/supabase-rpc'

export type QuestionFilter = 'all' | 'unseen' | 'incorrect' | 'flagged'

export async function getRandomQuestionIds(opts: {
  subjectId: string
  topicIds?: string[]
  subtopicIds?: string[]
  count: number
  filters?: QuestionFilter[]
  calcMode?: CalcMode
}): Promise<string[]> {
  const supabase = await createServerSupabaseClient()
  const { subjectId, topicIds, subtopicIds, count, filters, calcMode } = opts
  const activeFilters = filters?.filter((f) => f !== 'all') ?? []

  // undefined → null to RPC = unconstrained (whole subject pool); [] → empty array = match nothing (topic_id = ANY('{}') is always false).
  // p_calc_mode is a literal enum the RPC reads directly ('all' = unrestricted via CASE ELSE) — do NOT strip 'all' the way p_filters does.
  const { data, error } = await rpc<{ id: string }[]>(supabase, 'get_random_question_ids', {
    p_subject_id: subjectId,
    p_topic_ids: topicIds ?? null,
    p_subtopic_ids: subtopicIds ?? null,
    p_count: count,
    p_filters: activeFilters,
    p_calc_mode: calcMode ?? 'all',
  })
  if (error) {
    console.error('[getRandomQuestionIds] get_random_question_ids error:', error.message)
    return []
  }
  if (!Array.isArray(data)) return []
  // Per-row guard required by code-style.md §5 — the `rpc<{id: string}[]>` cast is
  // a TypeScript assertion only, not a runtime guarantee. Drop rows that don't
  // carry a string id; otherwise `undefined` would leak into start_quiz_session's
  // uuid[] arg and trigger a Postgres type error.
  return data
    .map((r) => (r && typeof r === 'object' ? (r as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string')
}
