'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TimeRange } from '../types'

const TIME_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]

type Props = {
  currentRange: TimeRange
}

export function DashboardHeader({ currentRange }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleRangeChange = useCallback(
    (value: string | null) => {
      if (!value) return
      const params = new URLSearchParams(searchParams.toString())
      if (value === '30d') {
        params.delete('range')
      } else {
        params.set('range', value)
      }
      params.delete('page')
      router.replace(`?${params.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Instructor overview of your cohort</p>
      </div>
      <Select value={currentRange} onValueChange={handleRangeChange} items={TIME_RANGE_OPTIONS}>
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
