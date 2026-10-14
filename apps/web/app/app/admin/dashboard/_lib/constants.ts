import type { StatusTone } from '@/components/ui/meter'
import type { TimeRange } from '../types'

export const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: TimeRange; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]

export function getMasteryTone(value: number): StatusTone {
  if (value < 50) return 'danger'
  if (value < 80) return 'caution'
  return 'success'
}

const MASTERY_COLOR: Record<StatusTone, string> = {
  danger: 'text-danger',
  caution: 'text-caution',
  success: 'text-success',
}

export function getMasteryColor(value: number): string {
  return MASTERY_COLOR[getMasteryTone(value)]
}
