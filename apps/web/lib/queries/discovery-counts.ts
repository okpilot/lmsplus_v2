import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import { rpc } from '@/lib/supabase-rpc'
import { filterSetKey, PRELOADED_FILTER_SETS } from './filtered-count-keys'
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

/** One subject's multiple-choice pool under one filter set; null on any failure so the client falls back. */
async function countSet(opts: {
  supabase: Supabase
  subjectId: string
  filters: readonly string[]
}): Promise<FilteredCounts | null> {
  const { supabase, subjectId, filters } = opts
  try {
    // The exact args getFilteredCount sends for the Discovery defaults.
    const { data, error } = await rpc<unknown>(supabase, 'get_filtered_question_counts', {
      p_subject_id: subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: [...filters],
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

/** All preloaded filter sets of one subject, keyed by `filterSetKey`; failed sets are omitted. */
async function countSubject(supabase: Supabase, subjectId: string) {
  const entries = await Promise.all(
    PRELOADED_FILTER_SETS.map(
      async (filters) =>
        [filterSetKey(filters), await countSet({ supabase, subjectId, filters })] as const,
    ),
  )
  const bySet: Record<string, FilteredCounts> = {}
  for (const [key, result] of entries) {
    if (result) bySet[key] = result
  }
  return bySet
}

/**
 * Discovery's multiple-choice count for every pickable subject under each filter set the UI
 * can produce (see `PRELOADED_FILTER_SETS`), keyed by subject id then `filterSetKey`, so
 * the setup form needs no request on subject change or filter toggle. Argument-free on
 * purpose: `cache()` keys by argument reference, and the subject ids come from the
 * already-cached `getSubjectsWithCounts()`. A failed set is omitted (the client uses the action).
 */
export const getDiscoveryCounts = cache(
  async (): Promise<Record<string, Record<string, FilteredCounts>>> => {
    const [supabase, subjects] = await Promise.all([
      createServerSupabaseClient(),
      getSubjectsWithCounts(),
    ])
    const results = await Promise.all(
      subjects.map(async (s) => [s.id, await countSubject(supabase, s.id)] as const),
    )
    const counts: Record<string, Record<string, FilteredCounts>> = {}
    for (const [id, bySet] of results) {
      if (Object.keys(bySet).length > 0) counts[id] = bySet
    }
    return counts
  },
)
