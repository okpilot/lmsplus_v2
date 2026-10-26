import type { FilteredCounts } from '@/lib/queries/discovery-counts'
import { filterSetKey } from '@/lib/queries/filtered-count-keys'
import type { CalcMode, ImageMode } from '../types'

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
