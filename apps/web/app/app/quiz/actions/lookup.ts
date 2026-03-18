'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { SubtopicOption, TopicOption, TopicWithSubtopics } from '@/lib/queries/quiz'
import {
  getSubtopicsForTopic,
  getTopicsForSubject,
  getTopicsWithSubtopics,
} from '@/lib/queries/quiz'
import type { QuestionIdRow } from './filter-helpers'
import { applyUnionFilters } from './filter-helpers'

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

export async function getFilteredCount(input: unknown): Promise<{ count: number }> {
  const { subjectId, topicIds, subtopicIds, filters } = FilteredCountSchema.parse(input)
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { count: 0 }

  let query = supabase
    .from('questions')
    .select('id')
    .eq('status', 'active')
    .eq('subject_id', subjectId)
    .is('deleted_at', null)

  if (topicIds?.length) query = query.in('topic_id', topicIds)
  if (subtopicIds?.length) query = query.in('subtopic_id', subtopicIds)

  const { data: rawData, error } = await query
  if (error) {
    console.error('[getFilteredCount] Questions query error:', error.message)
    return { count: 0 }
  }
  const data = (rawData ?? []) as QuestionIdRow[]
  if (!data.length) return { count: 0 }

  const activeFilters = filters.filter((f) => f !== 'all')
  if (!activeFilters.length) return { count: data.length }

  const result = await applyUnionFilters({
    supabase,
    userId: user.id,
    questions: data,
    filters: activeFilters,
  })
  return { count: result.length }
}
