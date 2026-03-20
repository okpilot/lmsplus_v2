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
import { buildQuestionQuery, groupCounts } from './lookup-helpers'

const IdSchema = z.uuid()

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
  const { subjectId, topicIds, subtopicIds, filters } = FilteredCountSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { ...empty, error: 'auth' }

  if (topicIds?.length === 0 || subtopicIds?.length === 0) return empty

  const { data, error } = await buildQuestionQuery(supabase, subjectId, topicIds, subtopicIds)
  if (error) {
    console.error('[getFilteredCount] Questions query error:', error.message)
    return empty
  }
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
