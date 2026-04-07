import type { TimeRange } from '../types'

export function rangeToDays(range: TimeRange): number {
  const map: Record<TimeRange, number> = { '7d': 7, '30d': 30, '90d': 90, all: 0 }
  return map[range]
}

export function rangeToCutoff(range: TimeRange): string | null {
  if (range === 'all') return null
  const days = rangeToDays(range)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return cutoff.toISOString()
}
