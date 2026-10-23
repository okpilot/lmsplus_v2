import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import { fetchAllRpcRows } from '@/lib/supabase-rpc'
import { filterSetKey } from './filtered-count-keys'
import { getSubjectsWithCounts } from './quiz-subject-queries'
import { getAllTopicTrees } from './quiz-topic-trees'

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

type DiscoveryCountRow = {
  subject_id: string
  topic_id: string
  subtopic_id: string | null
  // bigint COUNT(*) — PostgREST may serialize as a string; coerce with Number() at every read site.
  n_all: number | string
  n_unseen: number | string
  n_incorrect: number | string
  n_flagged: number | string
  n_incorrect_or_flagged: number | string
}

/** RPC count column -> the filter set it counts, keyed through `filterSetKey`. */
const COUNT_COLUMNS = [
  ['n_all', filterSetKey([])],
  ['n_unseen', filterSetKey(['unseen'])],
  ['n_incorrect', filterSetKey(['incorrect'])],
  ['n_flagged', filterSetKey(['flagged'])],
  ['n_incorrect_or_flagged', filterSetKey(['incorrect', 'flagged'])],
] as const

function isFiniteCount(value: unknown): boolean {
  return (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value))
}

/** Per-row guard required by code-style.md §5 — the `rpc<…>` cast is a TS assertion only. */
function isDiscoveryCountRow(value: unknown): value is DiscoveryCountRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.subject_id === 'string' &&
    typeof row.topic_id === 'string' &&
    (row.subtopic_id === null || typeof row.subtopic_id === 'string') &&
    COUNT_COLUMNS.every(([column]) => isFiniteCount(row[column]))
  )
}

type SubjectScope = { topicIds: Set<string>; subtopicIds: Set<string> }

function emptySets(): Record<string, FilteredCounts> {
  return Object.fromEntries(
    COUNT_COLUMNS.map(([, key]) => [key, { count: 0, byTopic: {}, bySubtopic: {} }]),
  )
}

/** Adds one row's counts to its subject's sets; a zero count adds nothing (the old RPC omitted empty groups). */
function addRow(sets: Record<string, FilteredCounts>, row: DiscoveryCountRow) {
  for (const [column, key] of COUNT_COLUMNS) {
    const n = Number(row[column])
    const target = sets[key]
    if (!target || n <= 0) continue
    target.count += n
    target.byTopic[row.topic_id] = (target.byTopic[row.topic_id] ?? 0) + n
    if (row.subtopic_id !== null) {
      target.bySubtopic[row.subtopic_id] = (target.bySubtopic[row.subtopic_id] ?? 0) + n
    }
  }
}

function inScope(row: DiscoveryCountRow, scope: SubjectScope): boolean {
  return (
    scope.topicIds.has(row.topic_id) ||
    (row.subtopic_id !== null && scope.subtopicIds.has(row.subtopic_id))
  )
}

/** One paged read for every subject; null on any failure so the client falls back to per-subject counts. */
async function fetchDiscoveryRows(): Promise<DiscoveryCountRow[] | null> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await fetchAllRpcRows<unknown>({
      supabase,
      fn: 'get_discovery_counts',
      args: {},
      orderColumns: ['subject_id', 'topic_id', 'subtopic_id'],
    })
    if (error) {
      console.error('[getDiscoveryCounts] get_discovery_counts error:', error.message)
      return null
    }
    const rows = data.filter(isDiscoveryCountRow)
    if (rows.length !== data.length) {
      console.error(`[getDiscoveryCounts] ${data.length - rows.length} malformed row(s)`)
      return null
    }
    return rows
  } catch (err) {
    console.error(
      '[getDiscoveryCounts] count read threw:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/**
 * Discovery's multiple-choice count for every pickable subject under each filter set the UI
 * can produce (see `PRELOADED_FILTER_SETS`), keyed by subject id then `filterSetKey`, so
 * the setup form needs no request on subject change or filter toggle. Argument-free on
 * purpose: `cache()` keys by argument reference, and the subject ids come from the
 * already-cached `getSubjectsWithCounts()`. One `get_discovery_counts` read (paged past the
 * row cap); a failed read or any malformed row returns `{}` (the client uses the per-subject action).
 */
export const getDiscoveryCounts = cache(
  async (): Promise<Record<string, Record<string, FilteredCounts>>> => {
    const [subjects, trees, rows] = await Promise.all([
      getSubjectsWithCounts(),
      getAllTopicTrees(),
      fetchDiscoveryRows(),
    ])
    if (!rows) return {}
    const counts: Record<string, Record<string, FilteredCounts>> = {}
    const scopes = new Map<string, SubjectScope>()
    for (const s of subjects) {
      const tree = trees[s.id]
      if (!tree?.length) continue
      counts[s.id] = emptySets()
      scopes.set(s.id, {
        topicIds: new Set(tree.map((t) => t.id)),
        subtopicIds: new Set(tree.flatMap((t) => t.subtopics.map((st) => st.id))),
      })
    }
    for (const row of rows) {
      const scope = scopes.get(row.subject_id)
      const sets = counts[row.subject_id]
      if (scope && sets && inScope(row, scope)) addRow(sets, row)
    }
    return counts
  },
)
