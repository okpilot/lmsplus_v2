'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { SubtopicOption, TopicOption, TopicWithSubtopics } from '@/lib/queries/quiz'
import {
  getSubtopicsForTopic,
  getTopicsForSubject,
  getTopicsWithSubtopics,
} from '@/lib/queries/quiz'
import { applyFilters } from './filter-helpers'

const IdSchema = z.string().uuid()

export async function fetchTopicsForSubject(raw: unknown): Promise<TopicOption[]> {
  return getTopicsForSubject(IdSchema.parse(raw))
}

export async function fetchSubtopicsForTopic(raw: unknown): Promise<SubtopicOption[]> {
  return getSubtopicsForTopic(IdSchema.parse(raw))
}

export async function fetchTopicsWithSubtopics(raw: unknown): Promise<TopicWithSubtopics[]> {
  return getTopicsWithSubtopics(IdSchema.parse(raw))
}

const FilteredCountSchema = z.object({
  subjectId: z.string().uuid(),
  topicIds: z.array(z.string().uuid()).optional(),
  subtopicIds: z.array(z.string().uuid()).optional(),
  filters: z.array(z.enum(['all', 'unseen', 'incorrect', 'flagged'])).default(['all']),
})

type QuestionWithGroup = { id: string; topic_id: string; subtopic_id: string | null }

export type FilteredCountResult = {
  count: number
  byTopic: Record<string, number>
  bySubtopic: Record<string, number>
}

export async function getFilteredCount(input: unknown): Promise<FilteredCountResult> {
  const empty: FilteredCountResult = { count: 0, byTopic: {}, bySubtopic: {} }
  const { subjectId, topicIds, subtopicIds, filters } = FilteredCountSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return empty

  let query = supabase
    .from('questions')
    .select('id, topic_id, subtopic_id')
    .eq('status', 'active')
    .eq('subject_id', subjectId)
    .is('deleted_at', null)

  if (topicIds?.length) query = query.in('topic_id', topicIds)
  if (subtopicIds?.length) query = query.in('subtopic_id', subtopicIds)

  const { data: rawData, error } = await query
  if (error) {
    console.error('[getFilteredCount] Questions query error:', error.message)
    return empty
  }
  const data = (rawData ?? []) as QuestionWithGroup[]
  if (!data.length) return empty

  const activeFilters = filters.filter((f) => f !== 'all')
  if (!activeFilters.length) return { count: data.length, ...groupCounts(data) }

  const result = await applyFilters({
    supabase,
    userId: user.id,
    questions: data,
    filters: activeFilters,
  })

  const filteredIds = new Set(result.map((q) => q.id))
  const filtered = data.filter((q) => filteredIds.has(q.id))
  return { count: filtered.length, ...groupCounts(filtered) }
}

function groupCounts(rows: QuestionWithGroup[]) {
  const byTopic: Record<string, number> = {}
  const bySubtopic: Record<string, number> = {}
  for (const r of rows) {
    byTopic[r.topic_id] = (byTopic[r.topic_id] ?? 0) + 1
    if (r.subtopic_id) {
      bySubtopic[r.subtopic_id] = (bySubtopic[r.subtopic_id] ?? 0) + 1
    }
  }
  return { byTopic, bySubtopic }
}
