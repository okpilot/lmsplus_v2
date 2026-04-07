import type { TimeRange } from '../types'

export const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: TimeRange; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]

export function getMasteryColor(value: number): string {
  if (value < 50) return 'text-red-600'
  if (value < 80) return 'text-amber-600'
  return 'text-green-600'
}
