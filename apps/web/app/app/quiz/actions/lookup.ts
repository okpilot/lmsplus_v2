'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import type {
  SubtopicOption,
  TopicOption,
  TopicWithSubtopics,
} from '@/lib/queries/quiz-query-types'
import {
  getSubtopicsForTopic,
  getTopicsForSubject,
  getTopicsWithSubtopics,
} from '@/lib/queries/quiz-subject-queries'
import { rpc } from '@/lib/supabase-rpc'

const IdSchema = z.uuid()

export async function fetchTopicsForSubject(raw: unknown): Promise<TopicOption[]> {
  await requireAuthUser()
  let id: string
  try {
    id = IdSchema.parse(raw)
  } catch {
    console.error('[fetchTopicsForSubject] Invalid input')
    return []
  }
  try {
    return await getTopicsForSubject(id)
  } catch (error) {
    console.error(
      '[fetchTopicsForSubject] query error:',
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

export async function fetchSubtopicsForTopic(raw: unknown): Promise<SubtopicOption[]> {
  await requireAuthUser()
  let id: string
  try {
    id = IdSchema.parse(raw)
  } catch {
    console.error('[fetchSubtopicsForTopic] Invalid input')
    return []
  }
  try {
    return await getSubtopicsForTopic(id)
  } catch (error) {
    console.error(
      '[fetchSubtopicsForTopic] query error:',
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

export async function fetchTopicsWithSubtopics(raw: unknown): Promise<TopicWithSubtopics[]> {
  await requireAuthUser()
  let id: string
  try {
    id = IdSchema.parse(raw)
  } catch {
    console.error('[fetchTopicsWithSubtopics] Invalid input')
    return []
  }
  try {
    return await getTopicsWithSubtopics(id)
  } catch (error) {
    console.error(
      '[fetchTopicsWithSubtopics] query error:',
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

const FilteredCountSchema = z.object({
  subjectId: z.uuid(),
  topicIds: z.array(z.uuid()).optional(),
  subtopicIds: z.array(z.uuid()).optional(),
  filters: z.array(z.enum(['all', 'unseen', 'incorrect', 'flagged'])).default(['all']),
  calcMode: z.enum(['all', 'only', 'exclude']).default('all'),
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
  const { subjectId, topicIds, subtopicIds, filters, calcMode } = parsed

  // undefined → null to RPC = unconstrained (whole subject pool); [] → empty array = match nothing (topic_id = ANY('{}') is always false).
  // p_calc_mode is a literal enum the RPC reads directly ('all' = unrestricted via CASE ELSE) — pass it through without stripping.
  const { data, error } = await rpc<
    { topic_id: string; subtopic_id: string | null; n: number | string }[]
  >(supabase, 'get_filtered_question_counts', {
    p_subject_id: subjectId,
    p_topic_ids: topicIds ?? null,
    p_subtopic_ids: subtopicIds ?? null,
    p_filters: filters.filter((f) => f !== 'all'),
    p_calc_mode: calcMode,
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
