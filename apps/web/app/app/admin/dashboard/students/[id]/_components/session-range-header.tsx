'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const TIME_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]

type Props = Readonly<{
  range: string
  onRangeChange: (value: string | null) => void
}>

export function SessionRangeHeader({ range, onRangeChange }: Props) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">Session History</h2>
      <Select value={range} onValueChange={onRangeChange} items={TIME_RANGE_OPTIONS}>
        <SelectTrigger className="w-40" aria-label="Time range">
          <SelectValue placeholder="Select range" />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} label={opt.label}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
