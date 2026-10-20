import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import { rpc } from '@/lib/supabase-rpc'
import { getSubjectsWithCounts } from './quiz-subject-queries'

export type FilteredCounts = {
  count: number
  byTopic: Record<string, number>
  bySubtopic: Record<string, number>
}

/**
 * Sums `get_filtered_question_counts` rows. Per-row guard required by code-style.md §5 —
 * the `rpc<…>` cast is a TS assertion only. Skips rows whose topic_id isn't a string or
 * whose n doesn't coerce to a finite number; otherwise NaN would poison count/byTopic and
 * a non-string topic_id would index into the record under a coerced key.
 */
export function sumFilteredCountRows(rows: unknown[]): FilteredCounts {
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

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>

/** One subject's whole multiple-choice pool; null on any failure so the client falls back. */
async function countSubject(supabase: Supabase, subjectId: string): Promise<FilteredCounts | null> {
  try {
    // The exact args getFilteredCount sends for the Discovery defaults.
    const { data, error } = await rpc<unknown>(supabase, 'get_filtered_question_counts', {
      p_subject_id: subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: [],
      p_calc_mode: 'all',
      p_has_image: 'all',
      p_question_type: 'multiple_choice',
    })
    if (error) {
      console.error('[getDiscoveryCounts] get_filtered_question_counts error:', error.message)
      return null
    }
    if (!Array.isArray(data)) {
      console.error('[getDiscoveryCounts] payload is not an array for subject', subjectId)
      return null
    }
    return sumFilteredCountRows(data)
  } catch (err) {
    console.error(
      '[getDiscoveryCounts] count read threw:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/**
 * Discovery's default multiple-choice count for every pickable subject, keyed by subject
 * id, so the setup form needs no request on subject change. Argument-free on purpose:
 * `cache()` keys by argument reference, and the subject ids come from the already-cached
 * `getSubjectsWithCounts()`. A failed subject is omitted (the client uses the action).
 */
export const getDiscoveryCounts = cache(async (): Promise<Record<string, FilteredCounts>> => {
  const [supabase, subjects] = await Promise.all([
    createServerSupabaseClient(),
    getSubjectsWithCounts(),
  ])
  const results = await Promise.all(
    subjects.map(async (s) => [s.id, await countSubject(supabase, s.id)] as const),
  )
  const counts: Record<string, FilteredCounts> = {}
  for (const [id, result] of results) {
    if (result) counts[id] = result
  }
  return counts
})
