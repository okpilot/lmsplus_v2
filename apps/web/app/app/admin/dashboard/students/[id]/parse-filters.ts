import { parsePageParam } from '@/lib/utils/parse-page-param'
import type { SessionSort, StudentSessionFilters, TimeRange } from '../../types'

const TIME_RANGE_VALUES = ['7d', '30d', '90d', 'all'] as const
const SORT_VALUES = ['date', 'subject', 'topic', 'mode', 'score', 'questions'] as const
const DIR_VALUES = ['asc', 'desc'] as const

export function parseSessionFilters(
  params: Record<string, string | string[] | undefined>,
): StudentSessionFilters {
  return {
    range:
      typeof params.range === 'string' &&
      (TIME_RANGE_VALUES as readonly string[]).includes(params.range)
        ? (params.range as TimeRange)
        : '30d',
    page: parsePageParam(params.page),
    sort:
      typeof params.sort === 'string' && (SORT_VALUES as readonly string[]).includes(params.sort)
        ? (params.sort as SessionSort)
        : 'date',
    dir:
      typeof params.dir === 'string' && (DIR_VALUES as readonly string[]).includes(params.dir)
        ? (params.dir as 'asc' | 'desc')
        : 'desc',
  }
}
