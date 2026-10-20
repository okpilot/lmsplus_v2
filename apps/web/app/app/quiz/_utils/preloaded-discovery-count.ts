import type { FilteredCounts } from '@/lib/queries/discovery-counts'
import type { CalcMode, ImageMode } from '../types'

/**
 * The server-preloaded whole-subject multiple-choice count, when it answers the question
 * being asked: Discovery's `multiple_choice` count with no student filter, calc or image
 * restriction. Null means ask the server. Callers pass the whole subject's topic ids.
 */
export function findPreloadedCount(
  counts: Record<string, FilteredCounts> | undefined,
  query: {
    subjectId: string
    filters: string[]
    calcMode: CalcMode
    imageMode: ImageMode
    questionType?: 'multiple_choice'
  },
): FilteredCounts | null {
  if (query.questionType !== 'multiple_choice') return null
  if (query.filters.length > 0 || query.calcMode !== 'all' || query.imageMode !== 'all') {
    return null
  }
  return counts?.[query.subjectId] ?? null
}
