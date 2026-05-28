'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import type { SubtopicOption, TopicOption, TopicWithSubtopics } from '@/lib/queries/quiz'
import {
  getSubtopicsForTopic,
  getTopicsForSubject,
  getTopicsWithSubtopics,
} from '@/lib/queries/quiz'
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
  return getTopicsForSubject(id)
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
  return getSubtopicsForTopic(id)
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
  return getTopicsWithSubtopics(id)
}

const FilteredCountSchema = z.object({
  subjectId: z.uuid(),
  topicIds: z.array(z.uuid()).optional(),
  subtopicIds: z.array(z.uuid()).optional(),
  filters: z.array(z.enum(['all', 'unseen', 'incorrect', 'flagged'])).default(['all']),
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
  const { subjectId, topicIds, subtopicIds, filters } = parsed

  // undefined → null to RPC = unconstrained (whole subject pool); [] → empty array = match nothing (topic_id = ANY('{}') is always false).
  const { data, error } = await rpc<
    { topic_id: string; subtopic_id: string | null; n: number | string }[]
  >(supabase, 'get_filtered_question_counts', {
    p_subject_id: subjectId,
    p_topic_ids: topicIds ?? null,
    p_subtopic_ids: subtopicIds ?? null,
    p_filters: filters.filter((f) => f !== 'all'),
  })
  if (error) {
    console.error('[getFilteredCount] get_filtered_question_counts error:', error.message)
    return empty
  }
  if (!Array.isArray(data)) return empty

  let count = 0
  const byTopic: Record<string, number> = {}
  const bySubtopic: Record<string, number> = {}
  for (const r of data) {
    const n = Number(r.n)
    count += n
    byTopic[r.topic_id] = (byTopic[r.topic_id] ?? 0) + n
    if (r.subtopic_id) {
      bySubtopic[r.subtopic_id] = (bySubtopic[r.subtopic_id] ?? 0) + n
    }
  }
  return { count, byTopic, bySubtopic }
}
