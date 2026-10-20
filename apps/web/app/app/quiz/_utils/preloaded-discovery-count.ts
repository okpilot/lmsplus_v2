import type { FilteredCounts } from '@/lib/queries/discovery-counts'
import { filterSetKey } from '@/lib/queries/filtered-count-keys'
import type { CalcMode, ImageMode, StampedPreload } from '../types'

/** Per-student counts go stale as the student answers; older than this they are not reused. */
export const PRELOAD_COUNTS_TTL_MS = 60_000

/** The preloaded Discovery counts while they are young enough to trust, else undefined. */
export function freshCounts(
  preload: StampedPreload | null | undefined,
  now: number,
): StampedPreload['discoveryCounts'] | undefined {
  if (!preload || now - preload.loadedAt > PRELOAD_COUNTS_TTL_MS) return undefined
  return preload.discoveryCounts
}

/**
 * The server-preloaded whole-subject multiple-choice count for the active student filter
 * set, when it answers the question being asked: Discovery's `multiple_choice` count with
 * no calc or image restriction. Null means ask the server. Callers pass the whole
 * subject's topic ids.
 */
export function findPreloadedCount(
  counts: Record<string, Record<string, FilteredCounts>> | undefined,
  query: {
    subjectId: string
    filters: string[]
    calcMode: CalcMode
    imageMode: ImageMode
    questionType?: 'multiple_choice'
  },
): FilteredCounts | null {
  if (query.questionType !== 'multiple_choice') return null
  if (query.calcMode !== 'all' || query.imageMode !== 'all') return null
  return counts?.[query.subjectId]?.[filterSetKey(query.filters)] ?? null
}
