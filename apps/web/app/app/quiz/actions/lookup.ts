'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { verifySessionUser } from '@/lib/auth/verify-session-user'
import { type FilteredCounts, sumFilteredCountRows } from '@/lib/queries/discovery-counts'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { getTopicsWithSubtopics } from '@/lib/queries/quiz-subject-queries'

const IdSchema = z.uuid()

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
  imageMode: z.enum(['all', 'only', 'exclude']).default('all'),
  // Study/Discovery counts only multiple_choice questions so the slider max /
  // Start-button / count badge match the MC-only fetch (startStudy). Omitted on
  // the quiz/exam count paths → omitted = no type restriction (#1008).
  questionType: z.enum(['multiple_choice']).optional(),
})

export type FilteredCountResult = FilteredCounts & { error?: 'auth' }

export async function getFilteredCount(input: unknown): Promise<FilteredCountResult> {
  const empty: FilteredCountResult = { count: 0, byTopic: {}, bySubtopic: {} }
  const supabase = await createServerSupabaseClient()
  if (!(await verifySessionUser(supabase))) return { ...empty, error: 'auth' }

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
  // p_question_type: 'multiple_choice' on the Study/Discovery path, omitted (SQL DEFAULT NULL, no restriction) on the quiz/exam paths (#1008).
  const { data, error } = await supabase.rpc('get_filtered_question_counts', {
    p_subject_id: subjectId,
    p_topic_ids: topicIds ?? null,
    p_subtopic_ids: subtopicIds ?? null,
    p_filters: filters.filter((f) => f !== 'all'),
    p_calc_mode: calcMode,
    p_has_image: imageMode,
    p_question_type: questionType,
  })
  if (error) {
    console.error('[getFilteredCount] get_filtered_question_counts error:', error.message)
    return empty
  }
  if (!Array.isArray(data)) return empty

  return sumFilteredCountRows(data)
}
